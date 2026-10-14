// A temporary status page for "/", until the real UI (Milestone 4) replaces
// it. Server-rendered and script-free. Everyone sees their own user id (for
// first-run setup); only allowlisted users see sync and setup details.

export interface PlaceholderInfo {
  userId: string | null;
  allowed: boolean;
  missingSettings: string[];
  notifyTargets: string[];
  mobileAppServices: string[];
  timeZone: string;
  fetchedAt: string | null;
  lastError: string | null;
  counts: Record<string, number> | null;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const list = (items: string[]) => (items.length ? items.map((i) => `<code>${escape(i)}</code>`).join(", ") : "none");

export function placeholderPage(info: PlaceholderInfo): string {
  const details = info.allowed
    ? `
<h2>Setup</h2>
<p>Missing settings: ${list(info.missingSettings)}</p>
<p>Notification targets: ${list(info.notifyTargets)}</p>
<p>Phones Home Assistant can notify: ${list(info.mobileAppServices)}</p>
<p>Time zone: <code>${escape(info.timeZone)}</code></p>
<h2>Sync</h2>
<p>Last synced: ${info.fetchedAt ? escape(info.fetchedAt) : "never"}</p>
<p>Last error: ${info.lastError ? escape(info.lastError) : "none"}</p>
<p>${
        info.counts
          ? Object.entries(info.counts)
              .map(([name, count]) => `${escape(name)}: ${count}`)
              .join(" · ")
          : "No data yet."
      }</p>`
    : `<p>You aren't allowed to use Thread yet. Add your user ID to <code>allowed_user_ids</code> in Thread's
Configuration tab, then restart the app.</p>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thread</title>
<style>
  body { font: 16px/1.5 system-ui; margin: 16px; max-width: 640px; }
  code { word-break: break-all; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }
</style></head><body>
<h1>Thread</h1>
<p>The server is running. The full interface arrives in the next milestone.</p>
<p>Your Home Assistant user ID: <code>${escape(info.userId ?? "(none)")}</code></p>
${details}
</body></html>`;
}
