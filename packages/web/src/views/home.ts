import { html, nothing, type TemplateResult } from "lit";
import {
  addDays,
  favorites,
  firstName,
  interactionPeople,
  interactionPeopleSummary,
  upcomingBirthdays,
  visibleInteractions,
  type Interaction,
  type Person,
} from "@thread/core";
import { avatar, avatarStack } from "../components.js";
import { formatMonthDay, untilLabel } from "../format.js";
import { icons } from "../icons.js";
import { href } from "../router.js";
import { snapshot, today } from "../state.js";
import type { View } from "./view.js";

// A one-person row splits in two: the person goes to their page, the rest to
// the interaction. With several people there's no single person to mean, so
// the whole row goes to the interaction, whose screen lists them.
export function interactionRow(interaction: Interaction, people: Person[]): TemplateResult {
  const sole = people.length === 1 ? people[0] : undefined;
  const header = html`${avatarStack(people)}<span class="name" style="flex:1;min-width:0"
      >${interactionPeopleSummary(people)}</span
    >`;
  return html`<div class="row" style="flex-direction:column;align-items:stretch;gap:2px">
    <a
      href=${sole ? href.person(sole.id) : href.interaction(interaction.id)}
      style="display:flex;align-items:center;gap:12px"
      >${header}</a
    >
    <a href=${href.interaction(interaction.id)} style="display:flex;gap:12px">
      <span class="sub" style="flex:1">${interaction.summary}</span>
      <span class="meta">${formatMonthDay(interaction.date)}</span>
    </a>
  </div>`;
}

function birthdayRow(person: Person, daysUntil: number): TemplateResult {
  return html`<a class="row" href=${href.person(person.id)}>
    ${avatar(person.name, person.photoUrl)}
    <span class="main">
      <div class="name">${person.name}</div>
      <div class="sub">${untilLabel(daysUntil)}</div>
    </span>
  </a>`;
}

export function homeView(): View {
  const { people, interactions } = snapshot();
  const favs = favorites(people);
  const birthdays = upcomingBirthdays(people, today(), 30).slice(0, 3);
  const recent = visibleInteractions(interactions, people, { since: addDays(today(), -30), limit: 10 });

  return {
    title: "Thread",
    back: false,
    actions: [{ icon: icons.gear, label: "Settings", href: href.settings() }],
    body: html`<div class="page">
      ${favs.length
        ? html`<div class="list" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px 12px;padding:16px">
            ${favs.map(
              (p) => html`<a href=${href.person(p.id)} style="display:grid;justify-items:center;gap:6px;min-width:0">
                ${avatar(p.name, p.photoUrl, 56)}
                <span style="font-weight:600;font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  >${firstName(p.name)}</span
                >
              </a>`,
            )}
          </div>`
        : nothing}

      <div class="section">
        <div class="section-head"><h2>Upcoming</h2><a href=${href.birthdays()}>See all</a></div>
        <div class="list">
          ${birthdays.length
            ? birthdays.map((b) => birthdayRow(b.person, b.daysUntil))
            : html`<div class="empty">No birthdays in the next 30 days.</div>`}
        </div>
      </div>

      <div class="section">
        <!-- "See more", not "See all": that list caps at 25. -->
        <div class="section-head"><h2>Recent</h2><a href=${href.interactions()}>See more</a></div>
        <div class="list">
          ${recent.length
            ? recent.map((i) => interactionRow(i, interactionPeople(i, people)))
            : html`<div class="empty">Nothing logged in the last 30 days.</div>`}
        </div>
      </div>
    </div>`,
  };
}

export function birthdaysView(): View {
  const all = upcomingBirthdays(snapshot().people, today());
  return {
    title: "Birthdays",
    back: true,
    actions: [],
    body: html`<div class="page list">
      ${all.map(
        ({ person, daysUntil }) => html`<a class="row" href=${href.person(person.id)}>
          ${avatar(person.name, person.photoUrl)}
          <span class="main"><div class="name">${person.name}</div></span>
          <span class="meta">${daysUntil === 0 ? "Today" : `${daysUntil}d`}</span>
        </a>`,
      )}
    </div>`,
  };
}

// No date window and the 25 most recent, so a quiet month still fills it.
export function interactionsView(): View {
  const { people, interactions } = snapshot();
  const list = visibleInteractions(interactions, people, { limit: 25 });
  return {
    title: "Recent",
    back: true,
    actions: [],
    body: html`<div class="page list">
      ${list.length
        ? list.map((i) => interactionRow(i, interactionPeople(i, people)))
        : html`<div class="empty">No interactions yet.</div>`}
    </div>`,
  };
}
