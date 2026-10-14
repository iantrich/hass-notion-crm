import { html, nothing } from "lit";
import { memberRoster, sortHousehold } from "@thread/core";
import { notionAction, personRow } from "../components.js";
import { plural } from "../format.js";
import { snapshot, statusFor } from "../state.js";
import type { View } from "./view.js";

function notFound(what: string): View {
  return { title: null, back: true, actions: [], body: html`<div class="empty">This ${what} no longer exists.</div>` };
}

function memberList(title: string, subtitle: string | null, memberIds: string[], ordered: boolean, url: string | null): View {
  const { people, relationships } = snapshot();
  const roster = memberRoster(memberIds, people);
  // Households read as a family: parents first, oldest to youngest. Groups
  // have no such structure, so they stay alphabetical.
  const members = ordered ? sortHousehold(roster, memberIds, relationships, (p) => p) : roster;
  return {
    title: null,
    back: true,
    actions: notionAction(url),
    body: html`<div class="page">
      <div style="padding:16px">
        <div class="h-serif" style="font-size:21px">${title}</div>
        ${subtitle ? html`<div class="muted" style="font-size:12.5px;margin-top:4px">${subtitle}</div>` : nothing}
        <!-- The members actually shown, not the raw id count. -->
        <div class="label" style="margin-top:6px">${plural(members.length, "member").toUpperCase()}</div>
      </div>
      <div class="list">${members.map((p) => personRow(p, statusFor(p)))}</div>
    </div>`,
  };
}

export function householdView(id: string): View {
  const household = snapshot().households.find((h) => h.id === id);
  if (!household) return notFound("household");
  return memberList(household.name, null, household.memberIds, true, household.notionPageUrl);
}

export function groupView(id: string): View {
  const group = snapshot().groups.find((g) => g.id === id);
  if (!group) return notFound("group");
  return memberList(group.name, group.description, group.memberIds, false, group.notionPageUrl);
}
