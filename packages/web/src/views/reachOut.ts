import { html, nothing } from "lit";
import type { ContactStatus, Person } from "@thread/core";
import { avatar } from "../components.js";
import { formatMonthDay, plural } from "../format.js";
import { href } from "../router.js";
import { snapshot, statusFor } from "../state.js";
import type { View } from "./view.js";

function row(person: Person, status: ContactStatus, overdue: boolean) {
  const color = overdue ? "var(--danger)" : "var(--gold)";
  return html`<a class="row" href=${href.person(person.id)}>
    <span style="width:3px;height:36px;border-radius:2px;background:${color};flex:none"></span>
    ${avatar(person.name, person.photoUrl)}
    <span class="main">
      <div class="name">${person.name}</div>
      <div class="sub">${status.lastContacted ? `Last: ${formatMonthDay(status.lastContacted)}` : "No interactions yet"}</div>
    </span>
    <span class="meta" style="color:${color}">${status.daysSinceContact === null ? "—" : `${status.daysSinceContact}d`}</span>
  </a>`;
}

// Least overdue first, matching the iOS ordering; no contact at all sinks.
const byDays = (a: { status: ContactStatus }, b: { status: ContactStatus }) =>
  (a.status.daysSinceContact ?? Infinity) - (b.status.daysSinceContact ?? Infinity);

export function reachOutView(): View {
  // A day-to-day view, so hidden people stay out, as on Home and Search.
  const entries = snapshot()
    .people.filter((p) => p.isCloseFriend && !p.hideFromList)
    .map((person) => ({ person, status: statusFor(person) }));
  const overdue = entries.filter((e) => e.status.urgency === "overdue").sort(byDays);
  const dueSoon = entries.filter((e) => e.status.urgency === "dueSoon").sort(byDays);

  return {
    title: "Reach out",
    back: false,
    actions: [],
    body: html`<div class="page">
      <div style="margin:16px;padding:16px;border-radius:16px;background:linear-gradient(135deg,#23293a,#1a2130)">
        <div class="mono gold" style="font-size:10px">CLOSE FRIEND ROTATION · ~6WK CADENCE</div>
        <div class="h-serif" style="font-size:17px;margin-top:6px">${plural(overdue.length, "person", "people")} overdue</div>
      </div>
      ${overdue.length
        ? html`<div class="label list-label">Overdue</div>
            <div class="list">${overdue.map((e) => row(e.person, e.status, true))}</div>`
        : nothing}
      ${dueSoon.length
        ? html`<div class="label list-label">Due soon</div>
            <div class="list">${dueSoon.map((e) => row(e.person, e.status, false))}</div>`
        : nothing}
      ${!overdue.length && !dueSoon.length ? html`<div class="empty">Everyone's been in touch recently.</div>` : nothing}
    </div>`,
  };
}
