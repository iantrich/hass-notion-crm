import { html, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import type { Interaction, InteractionType, Person } from "@thread/core";
import { avatar } from "../components.js";
import { icons } from "../icons.js";
import { href } from "../router.js";
import { addInteraction, goBack, state, today, update, updateInteraction, type LogForm } from "../state.js";

// "Other" stays a valid type for data from Notion, but like the iOS app the
// picker offers only these six.
const PILL_TYPES: InteractionType[] = ["Catch-up", "Trip", "Promotion", "Life Event", "Health", "Milestone"];

export const CLAUDE_URL = "https://claude.ai/new";

function formFor(key: string, editing: Interaction | null): LogForm {
  if (state.logForm?.key !== key) {
    state.logForm = {
      key,
      type: editing?.type ?? "Catch-up",
      date: editing?.date ?? today(),
      summary: editing?.summary ?? "",
      notes: editing?.notes ?? "",
    };
  }
  return state.logForm;
}

// Back to the screen under the sheet: the person, or the interaction.
function close(fallback: string) {
  update((s) => (s.logForm = null));
  goBack(fallback);
}

// Logging and editing share one sheet. Editing never touches who the
// interaction was with, so the extra people on a shared one survive a save.
export function logSheet(person: Person, editing: Interaction | null): TemplateResult {
  const form = formFor(editing ? `edit:${editing.id}` : `log:${person.id}`, editing);
  const done = () => close(editing ? href.interaction(editing.id) : href.person(person.id));
  const set = (patch: Partial<LogForm>) => update(() => Object.assign(form, patch));
  const summary = form.summary.trim();
  const notes = form.notes.trim() || null;
  const valid = summary !== "" && form.date !== "";

  const save = async () => {
    if (!valid) return;
    const ok = editing
      ? await updateInteraction(editing.id, { type: form.type, date: form.date, summary, notes })
      : await addInteraction({ personId: person.id, type: form.type, date: form.date, summary, notes });
    if (ok) done();
  };

  return html`<div class="sheet-backdrop" @click=${(e: Event) => e.target === e.currentTarget && done()}>
    <div class="sheet" role="dialog" aria-label=${editing ? "Edit interaction" : "Log interaction"}>
      <div class="topbar">
        <button class="icon-btn" style="padding:0 12px" @click=${done}>Cancel</button>
        <span class="title" style="text-align:center">${editing ? "Edit" : "Log"}</span>
        <button class="icon-btn gold" style="padding:0 12px;font-weight:600" ?disabled=${!valid || state.busy} @click=${save}>
          ${editing ? "Save Changes" : "Save to Notion"}
        </button>
      </div>
      <div class="sheet-body">
        <div class="form">
          <div class="field">
            <span>Person</span>
            <div style="display:flex;align-items:center;gap:10px">${avatar(person.name, person.photoUrl, 26)} ${person.name}</div>
          </div>
          <div class="field">
            <span>Type</span>
            <div class="pills">
              ${PILL_TYPES.map(
                (type) => html`<button class="pill ${form.type === type ? "on" : ""}" aria-pressed=${form.type === type} @click=${() => set({ type })}>
                  ${type}
                </button>`,
              )}
            </div>
          </div>
          <label class="field">
            <span>Date</span>
            <input class="input" type="date" required .value=${live(form.date)} @input=${(e: InputEvent) => set({ date: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="field">
            <span>Summary</span>
            <input class="input" maxlength="2000" .value=${live(form.summary)} @input=${(e: InputEvent) => set({ summary: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="field">
            <span>Notes</span>
            <textarea class="input" maxlength="2000" .value=${live(form.notes)} @input=${(e: InputEvent) => set({ notes: (e.target as HTMLTextAreaElement).value })}></textarea>
          </label>
          <a href=${CLAUDE_URL} target="_blank" rel="noopener noreferrer" style="display:grid;justify-items:center;gap:8px;padding:8px 0">
            <span class="action primary" style="width:44px;height:44px;border-radius:50%">${icons.mic}</span>
            <span class="muted" style="font-size:11.5px">Tap to ramble to Claude — it writes straight to Notion.</span>
          </a>
        </div>
      </div>
    </div>
  </div>`;
}
