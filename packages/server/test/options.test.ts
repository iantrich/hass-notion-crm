import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadOptions, missingNotionSettings, parseOptions } from "../src/options.js";
import { appSlug, panelPath, SupervisorClient, supervisorToken } from "../src/supervisor.js";
import { fakeFetch, json } from "./helpers.js";

describe("options", () => {
  it("defaults everything and lists what Notion still needs", () => {
    const options = parseOptions({});
    expect(options.syncIntervalMinutes).toBe(15);
    expect(missingNotionSettings(options)).toEqual([
      "notion_token",
      "me_person_id",
      "data_source_people",
      "data_source_households",
      "data_source_groups",
      "data_source_relationships",
      "data_source_interactions",
    ]);
  });

  it("accepts notify targets with or without the notify. prefix", () => {
    // HA displays the prefixed name, so that's what gets pasted (spike result).
    expect(parseOptions({ notify_targets: ["notify.mobile_app_iphone", " mobile_app_ipad ", ""] }).notifyTargets).toEqual([
      "mobile_app_iphone",
      "mobile_app_ipad",
    ]);
  });

  it("trims ids and rejects an out-of-range interval", () => {
    expect(parseOptions({ allowed_user_ids: [" abc ", ""] }).allowedUserIds).toEqual(["abc"]);
    expect(() => parseOptions({ sync_interval_minutes: 1 })).toThrow();
  });

  it("treats a missing options file as defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "thread-options-"));
    expect((await loadOptions(join(dir, "options.json"))).notionToken).toBe("");
    await writeFile(join(dir, "options.json"), JSON.stringify({ notion_token: "secret" }));
    expect((await loadOptions(join(dir, "options.json"))).notionToken).toBe("secret");
  });
});

describe("supervisor", () => {
  it("reads the token from the environment, else s6's saved copy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "thread-s6-"));
    expect(supervisorToken({ SUPERVISOR_TOKEN: "from-env" }, dir)).toBe("from-env");
    expect(supervisorToken({}, dir)).toBeNull();
    // s6-overlay resets the environment, so this is the path that ran on HA.
    await writeFile(join(dir, "SUPERVISOR_TOKEN"), "from-s6\n");
    expect(supervisorToken({}, dir)).toBe("from-s6");
  });

  it("derives the full slug and panel path from the hostname", () => {
    expect(appSlug("33991357-thread")).toBe("33991357_thread");
    expect(panelPath("33991357_thread")).toBe("/app/33991357_thread");
  });

  it("reads HA's time zone and its mobile app notify services", async () => {
    const { impl, requests } = fakeFetch((request) =>
      request.url.endsWith("/config")
        ? json({ time_zone: "America/Chicago" })
        : json([
            { domain: "light", services: { turn_on: {} } },
            { domain: "notify", services: { mobile_app_iphone: {}, persistent_notification: {} } },
          ]),
    );
    const client = new SupervisorClient("tok", impl);
    expect(await client.timeZone()).toBe("America/Chicago");
    expect(await client.mobileAppServices()).toEqual(["mobile_app_iphone"]);
    expect(requests[0]?.url).toBe("http://supervisor/core/api/config");
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("keeps Core's error body, which is otherwise a bare status", async () => {
    const client = new SupervisorClient("tok", fakeFetch(() => new Response("400: Bad Request", { status: 400 })).impl);
    await expect(client.notify("nope", { title: "t", message: "m" })).rejects.toThrow("400: Bad Request");
  });
});
