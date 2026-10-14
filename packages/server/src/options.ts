import { readFile } from "node:fs/promises";
import { z } from "zod";

// The app's settings, from the Configuration tab in Home Assistant. Supervisor
// writes them to /data/options.json.

// The Notion settings are optional in config.yaml so the app can start (and
// show its setup page) before they're filled in.
const optionsSchema = z.object({
  notion_token: z.string().default(""),
  me_person_id: z.string().default(""),
  data_source_people: z.string().default(""),
  data_source_households: z.string().default(""),
  data_source_groups: z.string().default(""),
  data_source_relationships: z.string().default(""),
  data_source_interactions: z.string().default(""),
  allowed_user_ids: z.array(z.string()).default([]),
  notify_targets: z.array(z.string()).default([]),
  sync_interval_minutes: z.number().int().min(5).max(240).default(15),
});

export interface DataSources {
  people: string;
  households: string;
  groups: string;
  relationships: string;
  interactions: string;
}

export interface Options {
  notionToken: string;
  mePersonId: string;
  dataSources: DataSources;
  allowedUserIds: string[];
  notifyTargets: string[];
  syncIntervalMinutes: number;
}

// What's missing for Thread to reach Notion. Empty means ready.
export function missingNotionSettings(options: Options): string[] {
  const missing: string[] = [];
  if (!options.notionToken) missing.push("notion_token");
  if (!options.mePersonId) missing.push("me_person_id");
  for (const [name, id] of Object.entries(options.dataSources)) {
    if (!id) missing.push(`data_source_${name}`);
  }
  return missing;
}

export function parseOptions(raw: unknown): Options {
  const parsed = optionsSchema.parse(raw);
  return {
    notionToken: parsed.notion_token.trim(),
    mePersonId: parsed.me_person_id.trim(),
    dataSources: {
      people: parsed.data_source_people.trim(),
      households: parsed.data_source_households.trim(),
      groups: parsed.data_source_groups.trim(),
      relationships: parsed.data_source_relationships.trim(),
      interactions: parsed.data_source_interactions.trim(),
    },
    allowedUserIds: parsed.allowed_user_ids.map((id) => id.trim()).filter(Boolean),
    // HA displays notify services with the "notify." prefix, so that's what
    // gets pasted; Core answers the prefixed name with a bare 400.
    notifyTargets: parsed.notify_targets
      .map((target) => target.trim().replace(/^notify\./, ""))
      .filter(Boolean),
    syncIntervalMinutes: parsed.sync_interval_minutes,
  };
}

export async function loadOptions(path: string): Promise<Options> {
  let raw: unknown = {};
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    // No file yet (local dev) means all defaults; anything else is real.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return parseOptions(raw);
}
