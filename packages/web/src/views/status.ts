import { html, nothing, type TemplateResult } from "lit";
import { load, state } from "../state.js";

// Screens for before the data exists: loading, not allowed, setup, failure.

export function loadingScreen(message = "Loading from Notion…"): TemplateResult {
  return html`<div class="center"><div><div class="spinner"></div><div class="mono muted" style="font-size:11px">${message}</div></div></div>`;
}

export function notAllowedScreen(userId: string | null): TemplateResult {
  return html`<div class="center">
    <div style="max-width:420px">
      <div class="h-serif" style="font-size:21px;margin-bottom:12px">Thread</div>
      <p>You aren't allowed to use Thread yet.</p>
      <p class="muted">Add your Home Assistant user ID to <code>allowed_user_ids</code> on Thread's Configuration tab, then restart the app.</p>
      <p>Your user ID:<br /><code style="word-break:break-all;color:var(--gold)">${userId ?? "(unknown)"}</code></p>
    </div>
  </div>`;
}

export function errorScreen(message: string): TemplateResult {
  return html`<div class="center">
    <div style="max-width:420px">
      <p>${message}</p>
      <button class="btn" @click=${() => void load()}>Try again</button>
    </div>
  </div>`;
}

// No data yet and no sync running: something in the configuration stops it.
export function setupScreen(): TemplateResult {
  const missing = state.setup?.missingSettings ?? [];
  const error = state.data?.status.lastError;
  return html`<div class="center">
    <div style="max-width:460px;text-align:left">
      <div class="h-serif" style="font-size:21px;margin-bottom:12px">Finish setting up Thread</div>
      ${missing.length
        ? html`<p>Fill these in on Thread's Configuration tab in Home Assistant, then restart the app:</p>
            <ul>${missing.map((m) => html`<li><code>${m}</code></li>`)}</ul>`
        : nothing}
      ${error ? html`<p class="danger">${error}</p>` : nothing}
      <button class="btn" @click=${() => void load()}>Check again</button>
    </div>
  </div>`;
}
