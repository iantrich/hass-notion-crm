import { notificationRoute, type DailyNotification } from "@thread/core";
import { log } from "../log.js";
import type { SupervisorClient } from "../supervisor.js";
import type { Sender } from "./scheduler.js";

// Sends through Home Assistant's notify.<target> services. Tapping the
// notification opens Thread's panel (/app/<full slug>, as the spike showed),
// with the screen to show appended: the web app picks the tail up from Home
// Assistant (see packages/web/src/deepLink.ts).
export class HomeAssistantSender implements Sender {
  constructor(
    private readonly supervisor: SupervisorClient | null,
    private readonly targets: () => string[],
    private readonly panelPath: string,
  ) {}

  async send(notification: {
    kind: DailyNotification["kind"] | "test";
    title: string;
    body: string;
    personIds?: string[];
    // Overrides the screen worked out from kind and personIds.
    route?: string;
  }): Promise<string[]> {
    const targets = this.targets();
    if (targets.length === 0) return ["no notify_targets configured"];
    if (!this.supervisor) {
      log.info(`Not in Home Assistant; would send a ${notification.kind} notification to ${targets.length} target(s)`);
      return [];
    }
    // HA's notify service requires a message. A one-person notification has
    // everything in its title, so that becomes the message on its own rather
    // than the same line twice.
    const message = {
      ...(notification.body ? { title: notification.title } : {}),
      message: notification.body || notification.title,
      data: { url: this.panelPath + (notification.route ?? routeOf(notification)), group: `thread-${notification.kind}` },
    };
    const failures: string[] = [];
    for (const target of targets) {
      try {
        await this.supervisor.notify(target, message);
      } catch (error) {
        failures.push(`${target}: ${(error as Error).message}`);
      }
    }
    return failures;
  }
}

function routeOf(notification: { kind: string; personIds?: string[] }): string {
  if (notification.kind === "test") return "";
  return notificationRoute({ kind: notification.kind as DailyNotification["kind"], personIds: notification.personIds ?? [] });
}
