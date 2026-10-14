import { html, nothing } from "lit";
import { interactionPeople } from "@thread/core";
import { avatar } from "../components.js";
import { formatLongDate } from "../format.js";
import { icons } from "../icons.js";
import { href } from "../router.js";
import { deleteInteraction, goBack, snapshot, state, update } from "../state.js";
import { logSheet } from "./log.js";
import type { View } from "./view.js";

export function interactionView(id: string, sheet: "edit" | null): View {
  const { interactions, people: everyone } = snapshot();
  const interaction = interactions.find((i) => i.id === id);
  if (!interaction) {
    return { title: null, back: true, actions: [], body: html`<div class="empty">This interaction no longer exists.</div>` };
  }
  const people = interactionPeople(interaction, everyone);
  const lead = people[0];

  const confirm =
    state.confirmDelete === id
      ? html`<div class="sheet-backdrop" style="align-items:center">
          <div class="dialog" role="alertdialog" aria-label="Delete this interaction?">
            <div class="h-serif" style="font-size:17px">Delete this interaction?</div>
            <div class="muted" style="font-size:12.5px">It moves to Notion's trash, where it can be restored.</div>
            <div class="actions">
              <button class="btn secondary" @click=${() => update((s) => (s.confirmDelete = null))}>Cancel</button>
              <button
                class="btn danger"
                ?disabled=${state.busy}
                @click=${async () => {
                  if (await deleteInteraction(id)) {
                    update((s) => (s.confirmDelete = null));
                    goBack(lead ? href.person(lead.id) : href.home());
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>`
      : nothing;

  return {
    title: null,
    back: true,
    actions: [
      { icon: icons.pencil, label: "Edit", href: href.editInteraction(id), disabled: !lead },
      { icon: icons.trash, label: "Delete interaction", onClick: () => update((s) => (s.confirmDelete = id)) },
    ],
    body: html`<div class="page" style="padding:20px;display:grid;gap:18px">
      ${people.length
        ? html`<div style="display:grid;gap:12px">
            ${people.length > 1 ? html`<div class="label">People</div>` : nothing}
            ${people.map(
              (p) => html`<a href=${href.person(p.id)} style="display:flex;align-items:center;gap:12px">
                ${avatar(p.name, p.photoUrl)}<span class="gold" style="font-weight:600;font-size:15px">${p.name}</span>
              </a>`,
            )}
          </div>`
        : nothing}
      <div>
        <div class="label">${formatLongDate(interaction.date)}</div>
        <div class="mono gold" style="font-size:10.5px">${interaction.type}</div>
      </div>
      <div class="h-serif" style="font-size:19px">${interaction.summary}</div>
      ${interaction.notes
        ? html`<div><div class="label" style="margin-bottom:6px">Notes</div><div style="white-space:pre-wrap">${interaction.notes}</div></div>`
        : nothing}
    </div>`,
    overlay: html`${sheet === "edit" && lead ? logSheet(lead, interaction) : nothing}${confirm}`,
  };
}
