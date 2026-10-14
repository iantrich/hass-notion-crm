import { html, nothing, type TemplateResult } from "lit";
import {
  buildPersonConnections,
  callUrl,
  emailUrl,
  formatPhone,
  isEmptyConnections,
  mapsUrl,
  messageUrl,
  type Interaction,
  type Person,
  type PersonConnection,
} from "@thread/core";
import { avatar } from "../components.js";
import { birthLine, formatMonthDayYear } from "../format.js";
import { icons } from "../icons.js";
import { href } from "../router.js";
import { interactionsFor, personById, snapshot, state, today, toggleFavorite, update } from "../state.js";
import { logSheet } from "./log.js";
import type { View } from "./view.js";

// tel:, sms: and mailto: open with target="_blank": inside the ingress
// iframe that's the only form the iOS Companion app hands to Phone, Messages
// or Mail (spike result). Harmless in desktop browsers.
function actionLink(icon: TemplateResult, label: string, url: string) {
  return html`<a class="action" href=${url} target="_blank" rel="noopener noreferrer" aria-label=${label} title=${label}
    >${icon}</a
  >`;
}

function actionButton(icon: TemplateResult, label: string, onClick: () => void, primary = false) {
  return html`<button class="action ${primary ? "primary" : ""}" @click=${onClick} aria-label=${label} title=${label}>
    ${icon}
  </button>`;
}

// Unavailable actions are left out rather than dimmed, so the row shows only
// how this person can actually be reached.
function actionRow(person: Person) {
  const hasSecond = callUrl(person.phone2) !== null;
  const call = callUrl(person.phone);
  const message = messageUrl(person.phone);
  const email = emailUrl(person.email);
  const map = mapsUrl(person);
  const pick = (action: "call" | "message") => () => update((s) => (s.phonePicker = { personId: person.id, action }));
  return html`<div class="actions-row">
    ${actionButton(icons.plus, "Log interaction", () => (location.hash = href.logInteraction(person.id)), true)}
    ${hasSecond
      ? html`${actionButton(icons.phone, "Call", pick("call"))}${actionButton(icons.message, "Message", pick("message"))}`
      : html`${call ? actionLink(icons.phone, "Call", call) : nothing}${message ? actionLink(icons.message, "Message", message) : nothing}`}
    ${email ? actionLink(icons.envelope, "Email", email) : nothing} ${map ? actionLink(icons.mapPin, "Map", map) : nothing}
  </div>`;
}

// Only nine people have a second number, so the choice stays out of the way.
export function phonePickerDialog(): TemplateResult | typeof nothing {
  const picker = state.phonePicker;
  const person = picker ? personById(picker.personId) : undefined;
  if (!picker || !person) return nothing;
  const close = () => update((s) => (s.phonePicker = null));
  const build = picker.action === "call" ? callUrl : messageUrl;
  const verb = picker.action === "call" ? "Call" : "Message";
  const numbers = [person.phone, person.phone2].filter((n): n is string => build(n) !== null);
  return html`<div class="sheet-backdrop" style="align-items:center" @click=${(e: Event) => e.target === e.currentTarget && close()}>
    <div class="dialog" role="dialog" aria-label="${verb} ${person.name}">
      ${numbers.map(
        (n) => html`<a class="btn secondary" style="display:grid;place-items:center" href=${build(n) ?? ""} target="_blank" rel="noopener" @click=${close}
          >${verb} ${formatPhone(n)}</a
        >`,
      )}
      <button class="btn" @click=${close}>Cancel</button>
    </div>
  </div>`;
}

function connectionRow(connection: PersonConnection) {
  const p = connection.person;
  return html`<a href=${href.person(p.id)} style="display:flex;align-items:center;gap:10px;padding:6px 0">
    ${avatar(p.name, p.photoUrl, 28)}
    <span style="flex:1;font-weight:600;font-size:13px">${p.name}</span>
    ${connection.connectionType ? html`<span class="mono muted" style="font-size:9px">${connection.connectionType.toUpperCase()}</span>` : nothing}
  </a>`;
}

const divider = html`<div style="border-top:1px solid var(--border);margin:9px 0"></div>`;

function connectionsCard(person: Person) {
  const { people, households, groups, relationships } = snapshot();
  // Ian is excluded: "Ian Richardson · SPOUSE" on every profile in his own
  // CRM is noise, not information.
  const c = buildPersonConnections(person.id, {
    people,
    households,
    groups,
    relationships,
    excludedId: state.data?.mePersonId ?? "",
  });
  if (isEmptyConnections(c)) return nothing;
  return html`<div class="label" style="padding:0 20px 8px">Connections</div>
    <div class="card">
      ${c.household
        ? html`<a href=${href.household(c.household.id)} style="display:flex;justify-content:space-between;padding-bottom:2px">
              <span class="mono gold" style="font-size:9.5px">${c.household.name.toUpperCase()}</span>
              <span class="mono muted" style="font-size:9px">HOUSEHOLD</span>
            </a>
            ${c.householdMembers.map(connectionRow)}`
        : nothing}
      ${c.others.length
        ? html`${c.household ? html`${divider}<div class="mono muted" style="font-size:9.5px">ELSEWHERE</div>` : nothing}
          ${c.others.map(connectionRow)}`
        : nothing}
      ${c.groups.length
        ? html`${c.household || c.others.length ? divider : nothing}
            <div class="mono muted" style="font-size:9.5px;padding-bottom:5px">GROUPS</div>
            <div class="chips">
              ${c.groups.map(
                (g) => html`<a class="chip" href=${href.group(g.id)}>${g.name}<span class="mono muted" style="font-size:8.5px">${g.memberIds.length}</span></a>`,
              )}
            </div>`
        : nothing}
    </div>`;
}

function socials(person: Person) {
  const links = [
    [person.website, icons.globe, "Website"],
    [person.linkedIn, icons.linkedIn, "LinkedIn profile"],
    [person.facebook, icons.facebook, "Facebook profile"],
    [person.instagram, icons.instagram, "Instagram profile"],
  ] as const;
  const present = links.filter(([url]) => url);
  if (!present.length) return nothing;
  return html`<div style="display:flex;gap:14px;padding:0 20px 18px">
    ${present.map(
      ([url, icon, label]) => html`<a class="gold" style="width:22px;height:22px;display:inline-flex" href=${url ?? ""} target="_blank" rel="noopener noreferrer" aria-label=${label} title=${label}
        >${icon}</a
      >`,
    )}
  </div>`;
}

function timeline(interactions: Interaction[]) {
  if (!interactions.length) return nothing;
  return html`<div class="label" style="padding:0 20px 8px">Timeline</div>
    <div style="display:grid;gap:16px;padding:0 20px 20px">
      ${interactions.map(
        (i) => html`<a href=${href.interaction(i.id)} style="display:flex;gap:12px;align-items:flex-start">
          <span style="width:11px;height:11px;border:2px solid var(--gold);border-radius:50%;margin-top:3px;flex:none"></span>
          <span>
            <div class="mono muted" style="font-size:9.5px">${formatMonthDayYear(i.date).toUpperCase()} · ${i.type.toUpperCase()}</div>
            <div style="font-weight:600;font-size:13px">${i.summary}</div>
          </span>
        </a>`,
      )}
    </div>`;
}

export function personView(id: string, sheet: "log" | null): View {
  const person = personById(id);
  if (!person) {
    return { title: null, back: true, actions: [], body: html`<div class="empty">This person no longer exists.</div>` };
  }
  const occupation = [person.occupation, person.employer].filter(Boolean).join(" - ");
  const how = person.howIKnowThem?.trim();

  return {
    title: null,
    back: true,
    actions: [
      {
        icon: person.isFavorite ? icons.starFill : icons.star,
        label: person.isFavorite ? "Remove from favorites" : "Add to favorites",
        className: person.isFavorite ? "gold" : "muted",
        onClick: () => void toggleFavorite(person),
      },
      ...(person.notionPageUrl ? [{ icon: icons.notion, label: "Open in Notion", href: person.notionPageUrl, external: true }] : []),
    ],
    body: html`<div class="page">
      <div style="display:grid;justify-items:center;gap:6px;padding:8px 20px 18px;text-align:center">
        ${avatar(person.name, person.photoUrl, 76)}
        <div class="h-serif" style="font-size:21px">${person.name}</div>
        ${occupation ? html`<div class="muted" style="font-size:12.5px">${occupation}</div>` : nothing}
        ${how ? html`<div class="muted" style="font-size:12.5px">${how}</div>` : nothing}
        ${person.birthday ? html`<div class="muted" style="font-size:12.5px">${birthLine(person.birthday, person.birthYearUnknown, today())}</div>` : nothing}
        ${person.isCloseFriend
          ? html`<div class="mono gold" style="font-size:10px;padding:4px 12px;border:1px dashed var(--thread);border-radius:999px;margin-top:4px">◆ Close Friend rotation</div>`
          : nothing}
      </div>
      ${actionRow(person)}
      ${person.relationshipSummary
        ? html`<div class="label" style="padding:0 20px 8px">Relationship summary</div>
            <div class="card" style="border-left:3px solid var(--gold);padding:14px;font-size:12.5px;white-space:pre-wrap">${person.relationshipSummary}</div>`
        : nothing}
      ${connectionsCard(person)} ${socials(person)} ${timeline(interactionsFor(person.id))}
    </div>`,
    overlay: html`${sheet === "log" ? logSheet(person, null) : nothing}${phonePickerDialog()}`,
  };
}
