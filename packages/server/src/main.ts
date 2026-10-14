import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { dayOf } from "@thread/core";
import { AvatarCache } from "./avatars.js";
import { createApp } from "./http/app.js";
import { placeholderPage } from "./http/placeholder.js";
import { StaticFiles } from "./http/static.js";
import { log } from "./log.js";
import { MOCK_ME_ID, MockNotionService } from "./mock/mockService.js";
import { NotionClient } from "./notion/client.js";
import { DATA_SOURCE_LABELS, LiveNotionService, type NotionService } from "./notion/service.js";
import { loadOptions, missingNotionSettings } from "./options.js";
import { AppState } from "./state/appState.js";
import { SnapshotStore } from "./state/snapshotStore.js";
import { SupervisorClient, supervisorToken } from "./supervisor.js";

const PORT = 8099;
const DATA_DIR = process.env.THREAD_DATA_DIR ?? "/data";
const DEV = process.env.THREAD_DEV === "1";
const MOCK = process.env.THREAD_MOCK === "1";
// The built web app: next to the bundle in the image, or the web package's
// build output when run from the repository.
const WEB_DIR = process.env.THREAD_WEB_DIR ?? new URL("./web", import.meta.url).pathname;

async function main() {
  const options = await loadOptions(`${DATA_DIR}/options.json`);
  if (MOCK) options.mePersonId = MOCK_ME_ID;

  const token = supervisorToken();
  const supervisor = token ? new SupervisorClient(token) : null;

  // HA's time zone decides "today" and when notifications fire. Outside HA,
  // the machine's own zone.
  let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (supervisor) {
    try {
      timeZone = await supervisor.timeZone();
    } catch (error) {
      log.warn(`Using ${timeZone}: couldn't read Home Assistant's time zone: ${(error as Error).message}`);
    }
  } else {
    log.warn(`No Supervisor token; using ${timeZone}`);
  }

  let service: NotionService;
  const missing = missingNotionSettings(options);
  if (MOCK) {
    log.info("Mock mode: serving made-up data, no Notion");
    service = new MockNotionService(dayOf(new Date(), timeZone));
  } else {
    if (missing.length > 0) log.warn(`Not syncing until these are set: ${missing.join(", ")}`);
    const labels = Object.fromEntries(
      Object.entries(options.dataSources).map(([key, id]) => [id, DATA_SOURCE_LABELS[key as keyof typeof DATA_SOURCE_LABELS]]),
    );
    service = new LiveNotionService(
      new NotionClient({ token: options.notionToken, labels }),
      options.dataSources,
      () => ({ timeZone }),
    );
  }

  const state = new AppState(service, new SnapshotStore(DATA_DIR));
  const avatars = new AvatarCache(`${DATA_DIR}/avatars`);
  state.onChange((snapshot) => avatars.register(snapshot));
  await state.loadCached();
  const cached = state.current();
  if (cached) avatars.register(cached);

  const app = createApp({
    state,
    avatars,
    options,
    timeZone: () => timeZone,
    mobileAppServices: () => supervisor?.mobileAppServices() ?? Promise.resolve([]),
    peerAddress: (c: Context) => (c.env as { incoming?: { socket?: { remoteAddress?: string } } }).incoming?.socket?.remoteAddress,
    dev: DEV,
    web: existsSync(join(WEB_DIR, "index.html")) ? new StaticFiles(WEB_DIR) : null,
    indexHtml: placeholderPage,
  });

  serve({ fetch: app.fetch, port: PORT }, () => log.info(`Thread listening on ${PORT}`));

  const canSync = MOCK || missing.length === 0;
  if (canSync) {
    void state.refresh();
    setInterval(() => void state.refresh(), options.syncIntervalMinutes * 60_000);
  }
}

main().catch((error: unknown) => {
  log.error(`Fatal: ${(error as Error).stack ?? String(error)}`);
  process.exit(1);
});
