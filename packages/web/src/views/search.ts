import { html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { compareNames, searchPeople, type ContactGroup, type Household } from "@thread/core";
import { avatar, personRow } from "../components.js";
import { plural } from "../format.js";
import { href } from "../router.js";
import { snapshot, state, statusFor, update } from "../state.js";
import type { View } from "./view.js";

const chips = [
  ["people", "People"],
  ["households", "Households"],
  ["groups", "Groups"],
] as const;

const matches = (text: string, query: string) => query === "" || text.toLocaleLowerCase().includes(query.toLocaleLowerCase());

function householdRow(h: Household) {
  return html`<a class="row" href=${href.household(h.id)}>
    ${avatar(h.name, h.photoUrl)}
    <span class="main"><div class="name">${h.name}</div></span>
    <span class="meta">${plural(h.memberIds.length, "member")}</span>
  </a>`;
}

function groupRow(g: ContactGroup) {
  return html`<a class="row" href=${href.group(g.id)}>
    ${avatar(g.name, g.photoUrl)}
    <span class="main">
      <div class="name">${g.name}</div>
      ${g.description ? html`<div class="sub">${g.description}</div>` : nothing}
    </span>
    <span class="meta">${plural(g.memberIds.length, "member")}</span>
  </a>`;
}

function results() {
  const { people, households, groups, relationships } = snapshot();
  const query = state.search.text.trim();
  switch (state.search.chip) {
    case "people": {
      const found = searchPeople(query, people, relationships);
      return html`${found.direct.map((p) => personRow(p, statusFor(p)))}
      ${found.connected.length
        ? html`<div class="label list-label">Connected</div>
            ${found.connected.map((m) => personRow(m.person, statusFor(m.person), m.reason))}`
        : nothing}
      ${found.direct.length + found.connected.length === 0 ? html`<div class="empty">No one matches “${query}”.</div>` : nothing}`;
    }
    case "households":
      return households
        .filter((h) => matches(h.name, query))
        .sort((a, b) => compareNames(a.name, b.name))
        .map(householdRow);
    case "groups":
      return groups
        .filter((g) => matches(g.name, query))
        .sort((a, b) => compareNames(a.name, b.name))
        .map(groupRow);
  }
}

export function searchView(): View {
  return {
    title: null,
    back: false,
    actions: [],
    body: html`<div class="page">
      <div style="padding:10px 16px 0">
        <input
          id="search-field"
          class="input"
          type="search"
          placeholder="Search"
          autocomplete="off"
          .value=${live(state.search.text)}
          @input=${(e: InputEvent) => update((s) => (s.search.text = (e.target as HTMLInputElement).value))}
        />
      </div>
      <div class="pills" style="padding:8px 16px">
        ${chips.map(
          ([key, label]) => html`<button
            class="pill mono ${state.search.chip === key ? "on" : ""}"
            aria-pressed=${state.search.chip === key}
            @click=${() => update((s) => (s.search.chip = key))}
          >
            ${label}
          </button>`,
        )}
      </div>
      <div class="list">${results()}</div>
    </div>`,
  };
}
