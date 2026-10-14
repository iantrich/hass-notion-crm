import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makePerson, type DailyNotification, type NotionSnapshot } from "@thread/core";
import { NotificationScheduler, NotificationStore, type Sender } from "../src/notifications/scheduler.js";
import { HomeAssistantSender } from "../src/notifications/sender.js";
import type { NotionService } from "../src/notion/service.js";
import { AppState } from "../src/state/appState.js";
import { SnapshotStore } from "../src/state/snapshotStore.js";
import { SupervisorClient } from "../src/supervisor.js";
import { fakeFetch, json } from "./helpers.js";

const ZONE = "America/Chicago";
// Chicago is UTC-5 in October (daylight time).
const at = (localDayTime: string) => new Date(`${localDayTime}:00-05:00`);

const snapshot = (): NotionSnapshot => ({
  people: [
    makePerson("p1", "Mera Richardson", { birthday: "2019-10-14" }),
    makePerson("p2", "Adam McLaughlin", { isCloseFriend: true }),
  ],
  households: [],
  groups: [],
  relationships: [],
  // Adam's last contact was 43 days before Oct 14: his 6-week mark is today.
  interactions: [{ id: "i1", summary: "Lunch", personIds: ["p2"], date: "2026-09-01", notes: null, type: "Catch-up" }],
  fetchedAt: "t",
});

class FakeService {
  syncs = 0;
  fail = false;
  data: NotionSnapshot | null = snapshot();
  async fetchSnapshot() {
    this.syncs++;
    if (this.fail || !this.data) throw new Error("Notion is down");
    return structuredClone(this.data);
  }
}

class FakeSender implements Sender {
  sent: DailyNotification[] = [];
  async send(n: DailyNotification) {
    this.sent.push(n);
    return [];
  }
}

async function setup(start: string) {
  const dir = await mkdtemp(join(tmpdir(), "thread-sched-"));
  const service = new FakeService();
  const state = new AppState(service as unknown as NotionService, new SnapshotStore(dir));
  const sender = new FakeSender();
  let now = at(start);
  const make = () =>
    new NotificationScheduler({ state, store: new NotificationStore(dir), sender, timeZone: () => ZONE, now: () => now });
  return { dir, service, state, sender, make, setNow: (t: string) => (now = at(t)) };
}

describe("NotificationScheduler", () => {
  it("sends each kind at its hour, after syncing", async () => {
    const { service, sender, make, setNow } = await setup("2026-10-14T09:59");
    const scheduler = make();
    await scheduler.tick();
    expect(sender.sent).toEqual([]);

    setNow("2026-10-14T10:00");
    await scheduler.tick();
    expect(sender.sent.map((n) => n.title)).toEqual(["🎂 Mera Richardson's birthday"]);
    expect(service.syncs).toBe(1);

    setNow("2026-10-14T15:00");
    await scheduler.tick();
    setNow("2026-10-14T21:00");
    await scheduler.tick();
    expect(sender.sent.map((n) => n.kind)).toEqual(["birthday", "overdue", "journal"]);
    expect(sender.sent[1]?.title).toBe("Adam McLaughlin just passed 6 weeks");
  });

  it("sends each kind once a day, even across a restart", async () => {
    const { sender, make, setNow } = await setup("2026-10-14T10:05");
    await make().tick();
    setNow("2026-10-14T10:30");
    await make().tick();
    expect(sender.sent).toHaveLength(1);
    // The next day it's checked again (and, with no birthday, sends nothing).
    setNow("2026-10-15T10:00");
    const nextDay = make();
    await nextDay.tick();
    expect((await nextDay.status()).find((k) => k.kind === "birthday")?.lastSent).toBe("2026-10-15");
  });

  it("still sends after a restart within the hour, but never late", async () => {
    const within = await setup("2026-10-14T10:59");
    await within.make().tick();
    expect(within.sender.sent).toHaveLength(1);

    const late = await setup("2026-10-14T11:00");
    await late.make().tick();
    expect(late.sender.sent).toEqual([]);
    expect(late.service.syncs).toBe(0);
  });

  it("uses cached data when the pre-send sync fails", async () => {
    const { service, state, sender, make } = await setup("2026-10-14T10:00");
    await state.refresh();
    service.fail = true;
    await make().tick();
    expect(sender.sent.map((n) => n.kind)).toEqual(["birthday"]);
  });

  it("skips, without recording, when there's no data at all", async () => {
    const { service, sender, make, setNow } = await setup("2026-10-14T10:00");
    service.data = null;
    const scheduler = make();
    await scheduler.tick();
    expect(sender.sent).toEqual([]);
    // Once Notion answers, still inside the window, it goes out.
    service.data = snapshot();
    setNow("2026-10-14T10:10");
    await scheduler.tick();
    expect(sender.sent).toHaveLength(1);
  });

  it("records a day with nothing to send, without sending", async () => {
    const { sender, make, setNow } = await setup("2026-10-15T10:00");
    const scheduler = make();
    await scheduler.tick();
    setNow("2026-10-15T10:01");
    await scheduler.tick();
    expect(sender.sent).toEqual([]);
    expect((await scheduler.status()).find((k) => k.kind === "birthday")?.lastSent).toBe("2026-10-15");
  });

  it("skips the journal reminder when something is logged today", async () => {
    const { service, sender, make } = await setup("2026-10-14T21:00");
    service.data = {
      ...snapshot(),
      interactions: [{ id: "i2", summary: "Coffee", personIds: ["p1"], date: "2026-10-14", notes: null, type: "Catch-up" }],
    };
    await make().tick();
    expect(sender.sent).toEqual([]);
  });
});

describe("HomeAssistantSender", () => {
  it("sends to every target with a tap URL for the panel", async () => {
    const { impl, requests } = fakeFetch(() => json({}));
    const sender = new HomeAssistantSender(new SupervisorClient("tok", impl), () => ["mobile_app_a", "mobile_app_b"], "/app/33991357_thread");
    const failures = await sender.send({ kind: "birthday", title: "🎂 3 birthdays today", body: "A, B, C" });
    expect(failures).toEqual([]);
    expect(requests.map((r) => r.url)).toEqual([
      "http://supervisor/core/api/services/notify/mobile_app_a",
      "http://supervisor/core/api/services/notify/mobile_app_b",
    ]);
    expect(requests[0]?.body).toEqual({
      title: "🎂 3 birthdays today",
      message: "A, B, C",
      data: { url: "/app/33991357_thread", group: "thread-birthday" },
    });
  });

  it("sends a one-line notification as the message alone", async () => {
    const { impl, requests } = fakeFetch(() => json({}));
    const sender = new HomeAssistantSender(new SupervisorClient("tok", impl), () => ["mobile_app_a"], "/app/x");
    await sender.send({ kind: "birthday", title: "🎂 Mera's birthday", body: "" });
    expect(requests[0]?.body).toMatchObject({ message: "🎂 Mera's birthday" });
    expect(requests[0]?.body).not.toHaveProperty("title");
  });

  it("reports each failed target, and having no targets", async () => {
    const { impl } = fakeFetch((r) => (r.url.endsWith("bad") ? new Response("400: Bad Request", { status: 400 }) : json({})));
    const sender = new HomeAssistantSender(new SupervisorClient("tok", impl), () => ["good", "bad"], "/app/x");
    const failures = await sender.send({ kind: "journal", title: "t", body: "b" });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("bad");
    expect(await new HomeAssistantSender(null, () => [], "/app/x").send({ kind: "journal", title: "t", body: "b" })).toEqual([
      "no notify_targets configured",
    ]);
  });
});
