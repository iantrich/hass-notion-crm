import type {
  ContactGroup,
  Household,
  Interaction,
  Person,
  RelationshipLink,
} from "../models.js";
import { toConnectionType, toInteractionType } from "../models.js";
import {
  checkboxOf,
  dayOfProperty,
  placeOf,
  relationOf,
  selectOf,
  textOf,
  titleOf,
  type NotionPage,
} from "./page.js";
import { PropertyName } from "./propertyNames.js";

// Mappers return null for a row that can't form a valid model (skip it: one
// unmappable row must never fail a sync) and throw RelationTruncatedError when
// Notion cut a relation short (fail the sync: that is silent data loss).

export interface MapContext {
  // IANA zone used to turn Notion datetimes into calendar days.
  timeZone: string;
}

// Only http(s) links survive: these are rendered as hrefs in the browser, so
// a "javascript:" value typed into Notion must not become a clickable link.
function webUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? raw : null;
  } catch {
    return null;
  }
}

export function mapPerson(page: NotionPage, ctx: MapContext): Person | null {
  const name = titleOf(page);
  if (!name) return null;

  // Surfaces truncation on the membership relations even though the ids
  // themselves are consumed by invertMembership.
  relationOf(page, PropertyName.household);
  relationOf(page, PropertyName.groups);

  return {
    id: page.id,
    name,
    phone: textOf(page, PropertyName.phone),
    phone2: textOf(page, PropertyName.phone2),
    email: textOf(page, PropertyName.email),
    occupation: textOf(page, PropertyName.occupation),
    employer: textOf(page, PropertyName.employer),
    howIKnowThem: textOf(page, PropertyName.howIKnowThem),
    birthday: dayOfProperty(page, PropertyName.birthday, ctx.timeZone),
    birthYearUnknown: checkboxOf(page, PropertyName.birthYearUnknown),
    isFavorite: checkboxOf(page, PropertyName.favorite),
    isCloseFriend: checkboxOf(page, PropertyName.closeFriend),
    hideFromList: checkboxOf(page, PropertyName.hideFromList),
    address: placeOf(page, PropertyName.address),
    householdAddress: placeOf(page, PropertyName.householdAddress),
    website: webUrl(textOf(page, PropertyName.website)),
    linkedIn: webUrl(textOf(page, PropertyName.linkedIn)),
    facebook: webUrl(textOf(page, PropertyName.facebook)),
    instagram: webUrl(textOf(page, PropertyName.instagram)),
    relationshipSummary: textOf(page, PropertyName.relationshipSummary),
    summaryUpdated: dayOfProperty(page, PropertyName.summaryUpdated, ctx.timeZone),
    notionPageUrl: webUrl(page.url),
    photoUrl: webUrl(page.photoUrl),
  };
}

// Direction is read from the People relation only, never from the title.
// A row without exactly two people can't express "B is the X of A".
export function mapRelationship(page: NotionPage): RelationshipLink | null {
  const people = relationOf(page, PropertyName.people);
  if (people.length !== 2) return null;
  return {
    id: page.id,
    personIds: people,
    connectionType: toConnectionType(selectOf(page, PropertyName.connectionType)),
    notes: textOf(page, PropertyName.notes),
  };
}

// Requires at least one person and a date. Every person on the relation is
// kept: an interaction counts for everyone it links. The live database has
// one entirely blank row, which this skips.
export function mapInteraction(page: NotionPage, ctx: MapContext): Interaction | null {
  const personIds = relationOf(page, PropertyName.person);
  const date = dayOfProperty(page, PropertyName.date, ctx.timeZone);
  if (personIds.length === 0 || !date) return null;
  return {
    id: page.id,
    summary: titleOf(page) ?? "",
    personIds,
    date,
    notes: textOf(page, PropertyName.notes),
    type: toInteractionType(selectOf(page, PropertyName.type)),
  };
}

// Household and group membership are built from member ids that
// invertMembership derived from the People side.
export function mapHousehold(page: NotionPage, memberIds: string[]): Household | null {
  const name = titleOf(page);
  if (!name) return null;
  return {
    id: page.id,
    name,
    memberIds,
    notionPageUrl: webUrl(page.url),
    photoUrl: webUrl(page.photoUrl),
  };
}

export function mapGroup(page: NotionPage, memberIds: string[]): ContactGroup | null {
  const name = titleOf(page);
  if (!name) return null;
  return {
    id: page.id,
    name,
    description: textOf(page, PropertyName.description),
    memberIds,
    notionPageUrl: webUrl(page.url),
    photoUrl: webUrl(page.photoUrl),
  };
}

// Household and Group membership is built by inverting each Person's own
// relations rather than reading the Members relation on the other side.
// Notion truncates relation arrays at 25 entries, and 4 of the 16 live Groups
// are truncated when read from the Groups side. Output order follows the
// people order, so the cached snapshot doesn't churn between syncs.
export function invertMembership(
  relationName: string,
  people: NotionPage[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const person of people) {
    for (const targetId of relationOf(person, relationName)) {
      const members = result.get(targetId);
      if (members) members.push(person.id);
      else result.set(targetId, [person.id]);
    }
  }
  return result;
}
