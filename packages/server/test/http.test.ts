import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makePerson, type NotionSnapshot } from "@thread/core";
import { AvatarCache, avatarKey } from "../src/avatars.js";
import { createApp, INGRESS_PROXY } from "../src/http/app.js";
import { placeholderPage } from "../src/http/placeholder.js";
import { MockNotionService } from "../src/mock/mockService.js";
import { parseOptions } from "../src/options.js";
import { AppState } from "../src/state/appState.js";
import { SnapshotStore } from "../src/state/snapshotStore.js";
import { fakeFetch } from "./helpers.js";

const ME = "user-ian";
const photo = "https://files.example.com/ws/uuid/image.png";

async function makeApp({ dev = false, peer = INGRESS_PROXY } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "thread-http-"));
  const service = new MockNotionService("2026-10-14");
  const state = new AppState(service, new SnapshotStore(dir));
  await state.refresh();
  const avatars = new AvatarCache(join(dir, "avatars"), fakeFetch(() => new Response(new Uint8Array([9]), { headers: { "Content-Type": "image/jpeg" } })).impl);
  const withPhoto: NotionSnapshot = { ...(state.current() as NotionSnapshot), people: [makePerson("p-photo", "Photo", { photoUrl: `${photo}?sig=1` })] };
  avatars.register(withPhoto);
  const app = createApp({
    state,
    avatars,
    options: parseOptions({ allowed_user_ids: [ME], me_person_id: "mock-me" }),
    timeZone: () => "America/Chicago",
    mobileAppServices: async () => ["mobile_app_iphone"],
    peerAddress: () => peer,
    dev,
    indexHtml: placeholderPage,
  });
  return { app, state };
}

const as = (userId: string | null, headers: Record<string, string> = {}) => ({
  headers: { ...(userId ? { "X-Remote-User-Id": userId } : {}), ...headers },
});
const write = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { "X-Remote-User-Id": ME, "Content-Type": "application/json", "X-Thread-Request": "1", ...headers },
  body: JSON.stringify(body),
});

describe("access", () => {
  it("refuses any peer but the ingress proxy, including IPv4-mapped forms", async () => {
    expect((await (await makeApp({ peer: "172.30.32.1" })).app.request("/api/snapshot", as(ME))).status).toBe(403);
    expect((await (await makeApp({ peer: "::ffff:172.30.32.2" })).app.request("/api/snapshot", as(ME))).status).toBe(200);
  });

  it("refuses users not on the allowlist and tells them their id", async () => {
    const { app } = await makeApp();
    const response = await app.request("/api/snapshot", as("someone-else"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_allowed", userId: "someone-else" });
    expect((await app.request("/api/snapshot", as(null))).status).toBe(403);
  });

  it("allows header-less requests only in dev mode", async () => {
    expect((await (await makeApp({ dev: true })).app.request("/api/snapshot")).status).toBe(200);
  });

  it("requires JSON and the custom header on writes", async () => {
    const { app } = await makeApp();
    const body = { isFavorite: true };
    expect((await app.request("/api/people/mock-drew/favorite", write("PUT", body, { "X-Thread-Request": "" }))).status).toBe(403);
    expect((await app.request("/api/people/mock-drew/favorite", write("PUT", body, { "Content-Type": "text/plain" }))).status).toBe(403);
    expect((await app.request("/api/people/mock-drew/favorite", write("PUT", body))).status).toBe(200);
  });

  it("sets security headers", async () => {
    const response = await (await makeApp()).app.request("/api/snapshot", as(ME));
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });
});

describe("routes", () => {
  let app: Awaited<ReturnType<typeof makeApp>>["app"];
  let state: AppState;
  beforeEach(async () => ({ app, state } = await makeApp()));

  it("serves the snapshot with today in HA's zone", async () => {
    const body = (await (await app.request("/api/snapshot", as(ME))).json()) as {
      snapshot: NotionSnapshot;
      mePersonId: string;
      today: string;
      status: { lastError: string | null };
    };
    expect(body.snapshot.people.length).toBeGreaterThan(0);
    expect(body.mePersonId).toBe("mock-me");
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.status.lastError).toBeNull();
  });

  it("validates interaction drafts and checks the person exists", async () => {
    const good = { personId: "mock-drew", type: "Catch-up", date: "2026-10-14", summary: "Lunch", notes: "" };
    const created = await app.request("/api/interactions", write("POST", good));
    expect(created.status).toBe(201);
    expect(((await created.json()) as { notes: unknown }).notes).toBeNull();
    expect((await app.request("/api/interactions", write("POST", { ...good, personId: "ghost" }))).status).toBe(400);
    expect((await app.request("/api/interactions", write("POST", { ...good, date: "2026-02-30" }))).status).toBe(400);
    expect((await app.request("/api/interactions", write("POST", { ...good, summary: "x".repeat(2001) }))).status).toBe(400);
    const bad = await app.request("/api/interactions", { ...write("POST", {}), body: "{not json" });
    expect(bad.status).toBe(400);
  });

  it("edits an interaction without changing who it was with, and deletes it", async () => {
    const existing = state.current()?.interactions[0];
    if (!existing) throw new Error("mock data has interactions");
    const patched = await app.request(
      `/api/interactions/${existing.id}`,
      write("PATCH", { type: "Trip", date: existing.date, summary: "Edited", notes: null, personIds: ["hijack"] }),
    );
    expect(await patched.json()).toMatchObject({ summary: "Edited", type: "Trip", personIds: existing.personIds });
    expect((await app.request(`/api/interactions/${existing.id}`, write("DELETE", {}))).status).toBe(204);
    expect((await app.request(`/api/interactions/${existing.id}`, write("DELETE", {}))).status).toBe(404);
  });

  it("creates people and refreshes one person", async () => {
    const created = await app.request(
      "/api/people",
      write("POST", { name: "New Person", phone: "", email: null, howIKnowThem: null, birthday: "1990-01-02", birthYearUnknown: false }),
    );
    expect(await created.json()).toMatchObject({ name: "New Person", phone: null, birthday: "1990-01-02" });
    expect((await app.request("/api/people/mock-drew/refresh", write("POST", {}))).status).toBe(200);
    expect((await app.request("/api/people/ghost/refresh", write("POST", {}))).status).toBe(404);
  });

  it("serves avatars as inert images", async () => {
    const response = await app.request(`/api/avatars/${avatarKey(photo)}`, as(ME));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    expect((await app.request(`/api/avatars/${"0".repeat(64)}`, as(ME))).status).toBe(404);
  });

  it("lists the setup state", async () => {
    expect(await (await app.request("/api/setup", as(ME))).json()).toMatchObject({
      mobileAppServices: ["mobile_app_iphone"],
      timeZone: "America/Chicago",
    });
  });

  it("answers unknown API routes with 404 JSON", async () => {
    expect((await app.request("/api/nope", as(ME))).status).toBe(404);
  });
});

describe("status page", () => {
  it("shows everyone their own id, escaped, but details only to allowed users", async () => {
    const { app } = await makeApp();
    const stranger = await (await app.request("/", as("<b>x</b>"))).text();
    expect(stranger).toContain("&#60;b&#62;x&#60;/b&#62;");
    expect(stranger).not.toContain("Last synced");
    expect(stranger).not.toContain("mobile_app_iphone");
    const ian = await (await app.request("/", as(ME))).text();
    expect(ian).toContain("Last synced");
    expect(ian).toContain("mobile_app_iphone");
  });
});
