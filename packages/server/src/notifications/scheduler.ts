import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  localTime,
  NOTIFICATION_HOURS,
  notificationFor,
  type CalendarDay,
  type DailyNotification,
  type NotificationKind,
} from "@thread/core";
import { log } from "../log.js";
import type { AppState } from "../state/appState.js";

// Sends the three daily notifications at their hour in Home Assistant's time
// zone. The server decides at fire time, so unlike the iOS app there's no
// plan to keep, no 64-notification cap and nothing to lapse.
//
// Rules:
// - Sync with Notion first, so the decision sees edits made anywhere. A failed
//   sync falls back to the cached data rather than skipping.
// - Each kind goes out at most once a day, across restarts (recorded in
//   /data/notify-state.json). The record is written before sending: a crash
//   mid-send can lose one notification, but never repeats one.
// - A restart within the hour after a fire time still sends it; later than
//   that, the window is missed and it's skipped rather than sent late.

export const KINDS: NotificationKind[] = ["birthday", "overdue", "journal"];
export const GRACE_MINUTES = 60;

export interface Sender {
  // Sends to every configured target; resolves with a failure per target.
  send(notification: DailyNotification): Promise<string[]>;
}

type Fired = Partial<Record<NotificationKind, CalendarDay>>;

export class NotificationStore {
  private readonly file: string;

  constructor(private readonly directory: string) {
    this.file = join(directory, "notify-state.json");
  }

  async load(): Promise<Fired> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as Fired) : {};
    } catch {
      return {};
    }
  }

  async save(fired: Fired): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(fired));
    await rename(`${this.file}.tmp`, this.file);
  }
}

export interface SchedulerDeps {
  state: AppState;
  store: NotificationStore;
  sender: Sender;
  timeZone: () => string;
  now?: () => Date;
}

export interface KindStatus {
  kind: NotificationKind;
  hour: number;
  lastSent: CalendarDay | null;
}

export class NotificationScheduler {
  private fired: Fired = {};
  private loaded = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => Date;

  constructor(private readonly deps: SchedulerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  start(intervalMs = 30_000): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async status(): Promise<KindStatus[]> {
    await this.ensureLoaded();
    return KINDS.map((kind) => ({ kind, hour: NOTIFICATION_HOURS[kind], lastSent: this.fired[kind] ?? null }));
  }

  // One pass: sends whatever is due and not yet sent today. Exposed for tests.
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureLoaded();
      for (const kind of KINDS) await this.maybeSend(kind);
    } catch (error) {
      log.error(`Notification check failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    this.fired = await this.deps.store.load();
    this.loaded = true;
  }

  private async maybeSend(kind: NotificationKind): Promise<void> {
    const { day, hour, minute } = localTime(this.now(), this.deps.timeZone());
    const minutesSinceFire = (hour - NOTIFICATION_HOURS[kind]) * 60 + minute;
    if (minutesSinceFire < 0 || minutesSinceFire >= GRACE_MINUTES) return;
    if (this.fired[kind] === day) return;

    // The decision has to see edits made in Notion since the last sync.
    await this.deps.state.refresh();
    const snapshot = this.deps.state.current();
    if (!snapshot) {
      log.warn(`Skipping the ${kind} notification: no data from Notion yet`);
      return;
    }

    // Recorded first: at most once, even if sending crashes partway.
    this.fired = { ...this.fired, [kind]: day };
    await this.deps.store.save(this.fired);

    const notification = notificationFor(kind, snapshot.people, snapshot.interactions, day);
    if (!notification) {
      log.info(`No ${kind} notification today`);
      return;
    }
    const failures = await this.deps.sender.send(notification);
    // Counts only: titles carry names, which stay out of the log.
    if (failures.length) log.error(`Sending the ${kind} notification failed: ${failures.join("; ")}`);
    else log.info(`Sent the ${kind} notification`);
  }
}
