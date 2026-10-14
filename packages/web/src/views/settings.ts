import { html, nothing } from "lit";
import type { NotificationStatus } from "../api.js";
import { ago, formatMonthDay } from "../format.js";
import { loadSettings, refresh, sendTestNotification, state, toast } from "../state.js";
import type { View } from "./view.js";

const LABELS: Record<NotificationStatus["kinds"][number]["kind"], string> = {
  birthday: "Birthdays",
  overdue: "Close friends at 6 weeks",
  journal: "Log today's interactions",
};

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

let requested = false;

export function settingsView(): View {
  // Fetched each time the screen opens, so "last sent" is current.
  if (!requested) {
    requested = true;
    void loadSettings().finally(() => (requested = false));
  }
  const status = state.data?.status;
  const n = state.notifications;
  const phones = state.setup?.mobileAppServices ?? [];
  const unknownTargets = n ? n.targets.filter((t) => phones.length > 0 && !phones.includes(t)) : [];

  return {
    title: "Settings",
    back: true,
    actions: [],
    body: html`<div class="page">
      <div class="label list-label">Sync with Notion</div>
      <div class="list">
        <div class="row">
          <span class="main">
            <div class="name">${status?.fetchedAt ? `Synced ${ago(status.fetchedAt)}` : "Not synced yet"}</div>
            ${status?.lastError ? html`<div class="sub danger" style="white-space:normal">${status.lastError}</div>` : nothing}
          </span>
          <button class="btn secondary" ?disabled=${state.refreshing} @click=${() => void refresh()}>Sync now</button>
        </div>
      </div>

      <div class="label list-label">Notifications${n ? html` · <span style="text-transform:none">${n.timeZone}</span>` : nothing}</div>
      <div class="list">
        ${n
          ? n.kinds.map(
              (k) => html`<div class="row">
                <span class="main">
                  <div class="name">${LABELS[k.kind]}</div>
                  <div class="sub">${k.lastSent ? `Last checked ${formatMonthDay(k.lastSent)}` : "Not sent yet"}</div>
                </span>
                <span class="meta">${hourLabel(k.hour)}</span>
              </div>`,
            )
          : html`<div class="empty">Loading…</div>`}
      </div>

      ${n
        ? html`<div style="padding:12px 16px;display:grid;gap:10px">
            <div class="muted" style="font-size:12.5px">
              ${n.targets.length
                ? html`Sent to ${n.targets.map((t, i) => html`${i ? ", " : ""}<code>${t}</code>`)}.`
                : html`No phones set. Add one to <code>notify_targets</code> on Thread's Configuration tab.`}
              ${phones.length && (unknownTargets.length || !n.targets.length)
                ? html`<br />Home Assistant can notify: ${phones.map((p, i) => html`${i ? ", " : ""}<code>${p}</code>`)}.`
                : nothing}
            </div>
            ${unknownTargets.length
              ? html`<div class="danger" style="font-size:12.5px">Home Assistant doesn't know ${unknownTargets.join(", ")}.</div>`
              : nothing}
            <button class="btn" ?disabled=${!n.targets.length || state.busy} @click=${() => void sendTestNotification()}>
              Send test notification
            </button>
          </div>`
        : nothing}
      ${shortcutSection()}
    </div>`,
  };
}

// iOS only lets an app put its own icon on the home screen, so the shortcut
// goes through the Shortcuts app and the Companion app's URL scheme, which
// opens any Home Assistant path, Thread's panel included.
function shortcutSection() {
  const panel = state.setup?.panelPath;
  if (!panel) return nothing;
  const url = `homeassistant://navigate${panel}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Copied.");
    } catch {
      toast("Couldn't copy. Select the link and copy it instead.");
    }
  };
  return html`<div class="label list-label">Home screen shortcut</div>
    <div style="padding:4px 16px 16px;display:grid;gap:10px;font-size:12.5px">
      <code style="word-break:break-all;user-select:all;background:var(--surface);padding:10px;border-radius:10px">${url}</code>
      <div style="display:flex;gap:8px">
        <button class="btn secondary" @click=${copy}>Copy link</button>
        <a class="btn secondary" style="display:inline-grid;place-items:center" href="icon-512.png" download="Thread.png" target="_blank" rel="noopener"
          >Save icon</a
        >
      </div>
      <ol class="muted" style="margin:0;padding-left:18px;display:grid;gap:4px">
        <li>Copy the link and save the icon to Photos.</li>
        <li>In the Shortcuts app, make a new shortcut with the <b>Open URLs</b> action and paste the link.</li>
        <li>Rename it Thread, then use <b>Add to Home Screen</b> and pick the icon from Photos.</li>
      </ol>
      <div class="muted">Add <code>/reach-out</code> or <code>/add</code> to the end of the link to open that screen instead.</div>
    </div>`;
}
