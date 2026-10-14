import { extname } from "node:path";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  dayOf,
  INTERACTION_TYPES,
  isCalendarDay,
  type Interaction,
} from "@thread/core";
import { withAvatarRoutes, withPhotoRoute, type AvatarCache } from "../avatars.js";
import { log } from "../log.js";
import { NotionError } from "../notion/errors.js";
import { missingNotionSettings, type Options } from "../options.js";
import { NotSyncedError, type AppState } from "../state/appState.js";
import type { PlaceholderInfo } from "./placeholder.js";
import type { StaticFiles } from "./static.js";

// The Supervisor's ingress proxy: the only peer allowed to connect.
export const INGRESS_PROXY = "172.30.32.2";

export interface AppDeps {
  state: AppState;
  avatars: AvatarCache;
  options: Options;
  timeZone: () => string;
  // notify.mobile_app_* services, for the setup screen. Empty outside HA.
  mobileAppServices: () => Promise<string[]>;
  // The connecting socket's address; injectable for tests.
  peerAddress: (c: Context) => string | undefined;
  // Local development: any peer, and no HA user header required.
  dev: boolean;
  // The built web app. Without it (running the server alone), "/" falls back
  // to the server-rendered status page.
  web: StaticFiles | null;
  indexHtml: (info: PlaceholderInfo) => string;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Notion rejects a single text object over 2,000 characters.
const text = (max = 2000) => z.string().trim().max(max);
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === "" ? null : value));
const calendarDay = z.string().refine(isCalendarDay, "must be a YYYY-MM-DD date");
const interactionType = z.enum(INTERACTION_TYPES);

const newPersonSchema = z.object({
  name: text(200).min(1),
  phone: optionalText(50),
  email: optionalText(200),
  howIKnowThem: optionalText(),
  birthday: calendarDay.nullable(),
  birthYearUnknown: z.boolean(),
});

const favoriteSchema = z.object({ isFavorite: z.boolean() });

const newInteractionSchema = z.object({
  personId: z.string().min(1),
  type: interactionType,
  date: calendarDay,
  summary: text().min(1),
  notes: optionalText(),
});

const interactionUpdateSchema = z.object({
  type: interactionType,
  date: calendarDay,
  summary: text().min(1),
  notes: optionalText(),
});

// Request paths with ids replaced, so logs never carry Notion ids or avatar
// keys (which identify a person's photo).
function routeForLog(path: string): string {
  return path.replace(/[0-9a-f]{64}|[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi, ":id");
}

function errorResponse(c: Context, error: unknown) {
  if (error instanceof z.ZodError) {
    return c.json({ error: "invalid_request", issues: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  }
  if (error instanceof SyntaxError) return c.json({ error: "invalid_request", issues: ["body is not valid JSON"] }, 400);
  if (error instanceof NotSyncedError) return c.json({ error: "not_synced", message: error.message }, 409);
  if (error instanceof NotionError) {
    const status = error.kind === "pageNotFound" ? 404 : error.kind === "rateLimited" ? 503 : 502;
    return c.json({ error: `notion_${error.kind}`, message: error.message }, status);
  }
  log.error(`Unhandled error: ${(error as Error).message}`);
  return c.json({ error: "internal", message: "Something went wrong. See the app's log." }, 500);
}

export function createApp(deps: AppDeps) {
  const { state, avatars, options } = deps;
  const app = new Hono();

  app.use(async (c, next) => {
    const started = Date.now();
    await next();
    log.info(`${c.req.method} ${routeForLog(c.req.path)} ${c.res.status} ${Date.now() - started}ms`);
  });

  // Only the ingress proxy may connect (HA's ingress requirement).
  app.use(async (c, next) => {
    if (!deps.dev) {
      const peer = deps.peerAddress(c)?.replace(/^::ffff:/, "");
      if (peer !== INGRESS_PROXY) return c.text("Forbidden", 403);
    }
    await next();
  });

  app.use(async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    if (!c.res.headers.has("Content-Security-Policy")) {
      c.header(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'",
      );
    }
  });

  // Every API call must come from an allowlisted HA user. Supervisor sets
  // X-Remote-User-Id and strips any client-sent copy, so it can be trusted.
  // The refusal shows the caller their own id, which is how first-run setup
  // finds the id to paste into allowed_user_ids.
  app.use("/api/*", async (c, next) => {
    const userId = c.req.header("X-Remote-User-Id") ?? null;
    const allowed = userId !== null && options.allowedUserIds.includes(userId);
    if (!allowed && !(deps.dev && userId === null)) {
      return c.json({ error: "not_allowed", userId }, 403);
    }
    // A cross-site form can't send JSON or a custom header without a CORS
    // preflight, which this server never answers.
    if (MUTATING.has(c.req.method)) {
      const json = (c.req.header("Content-Type") ?? "").startsWith("application/json");
      if (!json || c.req.header("X-Thread-Request") !== "1") {
        return c.json({ error: "csrf", message: "Requests must be JSON with X-Thread-Request: 1" }, 403);
      }
    }
    await next();
  });

  const view = () => {
    const snapshot = state.current();
    return {
      snapshot: snapshot ? withAvatarRoutes(snapshot) : null,
      status: state.status(),
      mePersonId: options.mePersonId,
      today: dayOf(new Date(), deps.timeZone()),
    };
  };
  const knownPerson = (id: string) => state.current()?.people.some((p) => p.id === id) ?? false;

  app.get("/api/snapshot", (c) => c.json(view()));

  app.post("/api/refresh", async (c) => {
    await state.refresh();
    return c.json(view());
  });

  const mobileAppServices = async () => {
    try {
      return await deps.mobileAppServices();
    } catch (error) {
      log.warn(`Couldn't list notify services: ${(error as Error).message}`);
      return [];
    }
  };

  app.get("/api/setup", async (c) =>
    c.json({
      missingSettings: missingNotionSettings(options),
      notifyTargets: options.notifyTargets,
      mobileAppServices: await mobileAppServices(),
      timeZone: deps.timeZone(),
    }),
  );

  app.post("/api/people", async (c) => {
    try {
      const draft = newPersonSchema.parse(await c.req.json());
      return c.json(withPhotoRoute(await state.addPerson(draft)), 201);
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.post("/api/people/:id/refresh", async (c) => {
    try {
      const id = c.req.param("id");
      if (!knownPerson(id)) return c.json({ error: "not_found" }, 404);
      await state.refreshPerson(id);
      return c.json(view());
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.put("/api/people/:id/favorite", async (c) => {
    try {
      const id = c.req.param("id");
      const { isFavorite } = favoriteSchema.parse(await c.req.json());
      if (!knownPerson(id)) return c.json({ error: "not_found" }, 404);
      return c.json(withPhotoRoute(await state.setFavorite(id, isFavorite)));
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.post("/api/interactions", async (c) => {
    try {
      const draft = newInteractionSchema.parse(await c.req.json());
      if (!knownPerson(draft.personId)) return c.json({ error: "unknown_person" }, 400);
      return c.json(await state.addInteraction(draft), 201);
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.patch("/api/interactions/:id", async (c) => {
    try {
      const patch = interactionUpdateSchema.parse(await c.req.json());
      const existing = state.current()?.interactions.find((i) => i.id === c.req.param("id"));
      if (!existing) return c.json({ error: "not_found" }, 404);
      const updated: Interaction = { ...existing, ...patch };
      return c.json(await state.updateInteraction(updated));
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.delete("/api/interactions/:id", async (c) => {
    try {
      const id = c.req.param("id");
      if (!state.current()?.interactions.some((i) => i.id === id)) return c.json({ error: "not_found" }, 404);
      await state.deleteInteraction(id);
      return c.body(null, 204);
    } catch (error) {
      return errorResponse(c, error);
    }
  });

  app.get("/api/avatars/:key", async (c) => {
    const avatar = await avatars.get(c.req.param("key"));
    if (!avatar) return c.body(null, 404);
    return c.body(new Uint8Array(avatar.bytes), 200, {
      "Content-Type": avatar.contentType,
      // A key changes when the photo does, so a cached copy is never stale.
      "Cache-Control": "private, max-age=604800, immutable",
      // Never a document, even if opened directly.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
  });

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  app.get("*", async (c) => {
    if (deps.web) {
      // The web app handles not-allowed and setup states itself, from the API.
      const path = c.req.path === "/" ? "/index.html" : c.req.path;
      const file = (await deps.web.file(path)) ?? (extname(path) ? null : await deps.web.index());
      if (!file) return c.text("Not found", 404);
      return c.body(new Uint8Array(file.body), 200, {
        "Content-Type": file.contentType,
        "Cache-Control": file.cacheControl,
      });
    }
    const userId = c.req.header("X-Remote-User-Id") ?? null;
    const allowed = (userId !== null && options.allowedUserIds.includes(userId)) || (deps.dev && userId === null);
    const snapshot = state.current();
    const status = state.status();
    return c.html(
      deps.indexHtml({
        userId,
        allowed,
        missingSettings: allowed ? missingNotionSettings(options) : [],
        notifyTargets: allowed ? options.notifyTargets : [],
        mobileAppServices: allowed ? await mobileAppServices() : [],
        timeZone: deps.timeZone(),
        fetchedAt: allowed ? status.fetchedAt : null,
        lastError: allowed ? status.lastError : null,
        counts:
          allowed && snapshot
            ? {
                people: snapshot.people.length,
                households: snapshot.households.length,
                groups: snapshot.groups.length,
                relationships: snapshot.relationships.length,
                interactions: snapshot.interactions.length,
              }
            : null,
      }),
    );
  });

  return app;
}
