import type { CalendarDay } from "./calendarDay.js";

// Every model is plain JSON-safe data: the server caches the snapshot on disk
// and sends it to the browser as-is, so nothing here may hold a class, a Date
// or a URL object.

// Mirrors Notion's Place property payload: {lat, lon, name, address}.
export interface PlaceAddress {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface Person {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  occupation: string | null;
  employer: string | null;
  howIKnowThem: string | null;
  birthday: CalendarDay | null;
  birthYearUnknown: boolean;
  isFavorite: boolean;
  isCloseFriend: boolean;
  hideFromList: boolean;
  address: PlaceAddress | null;
  householdAddress: PlaceAddress | null;
  website: string | null;
  linkedIn: string | null;
  facebook: string | null;
  instagram: string | null;
  relationshipSummary: string | null;
  summaryUpdated: CalendarDay | null;
  notionPageUrl: string | null;
  // The page icon. Notion-hosted URLs are presigned and expire; the server
  // swaps this for a stable avatar route before anything reaches a browser.
  photoUrl: string | null;
}

// Minimal person for tests and fixtures.
export function makePerson(id: string, name: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name,
    phone: null,
    phone2: null,
    email: null,
    occupation: null,
    employer: null,
    howIKnowThem: null,
    birthday: null,
    birthYearUnknown: false,
    isFavorite: false,
    isCloseFriend: false,
    hideFromList: false,
    address: null,
    householdAddress: null,
    website: null,
    linkedIn: null,
    facebook: null,
    instagram: null,
    relationshipSummary: null,
    summaryUpdated: null,
    notionPageUrl: null,
    photoUrl: null,
    ...overrides,
  };
}

export interface Household {
  id: string;
  name: string;
  memberIds: string[];
  notionPageUrl: string | null;
  photoUrl: string | null;
}

export interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  memberIds: string[];
  notionPageUrl: string | null;
  photoUrl: string | null;
}

// The options on Notion's "Connection Type" select, verbatim. A value Notion
// sends that isn't listed here decodes to "Other".
export const CONNECTION_TYPES = [
  "Spouse",
  "Ex-Spouse",
  "Partner",
  "Sibling",
  "Parent",
  "Child",
  "Grandparent",
  "Grandchild",
  "Pibling",
  "Nibling",
  "Friend",
  "College Friend",
  "Neighbor",
  "Coworker",
  "Former Coworker",
  "Mentor",
  "Mentee",
  "Employer",
  "Employee",
  "Extended Family",
  "In-Law",
  "Sibling-in-law",
  "Parent-in-law",
  "Child-in-law",
  "Other",
] as const;

export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export function toConnectionType(raw: string | null | undefined): ConnectionType {
  return (CONNECTION_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as ConnectionType)
    : "Other";
}

// The label from the other person's perspective. Matches Notion's own
// "Connection Type (Reverse)" formula, which the iOS app checked against all
// 278 live rows. Unlisted types are symmetric.
const INVERSES: Partial<Record<ConnectionType, ConnectionType>> = {
  Parent: "Child",
  Child: "Parent",
  Grandparent: "Grandchild",
  Grandchild: "Grandparent",
  Pibling: "Nibling",
  Nibling: "Pibling",
  "Parent-in-law": "Child-in-law",
  "Child-in-law": "Parent-in-law",
  Mentor: "Mentee",
  Mentee: "Mentor",
  Employer: "Employee",
  Employee: "Employer",
};

export function inverseOf(type: ConnectionType): ConnectionType {
  return INVERSES[type] ?? type;
}

export interface RelationshipLink {
  id: string;
  // Order is authoritative: personIds[1] is the connectionType of
  // personIds[0]. Never infer direction from the Notion page title; titles
  // are a display convenience and were found stale on several live rows.
  personIds: string[];
  connectionType: ConnectionType;
  notes: string | null;
}

// What the OTHER person on the link is to `personId`. Stored as "personIds[1]
// is the connectionType of personIds[0]", so it inverts when the subject is
// in slot 1. Null when the person isn't on the link.
export function connectionTypeRelativeTo(
  link: RelationshipLink,
  personId: string,
): ConnectionType | null {
  const index = link.personIds.indexOf(personId);
  if (index === -1) return null;
  return index === 1 ? inverseOf(link.connectionType) : link.connectionType;
}

export const INTERACTION_TYPES = [
  "Catch-up",
  "Trip",
  "Promotion",
  "Life Event",
  "Health",
  "Milestone",
  "Other",
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export function toInteractionType(raw: string | null | undefined): InteractionType {
  return (INTERACTION_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as InteractionType)
    : "Other";
}

export interface Interaction {
  id: string;
  summary: string;
  // Notion's Person relation is many-to-many: one shared dinner is a single
  // row linked to everyone who was there. Order is Notion's and is
  // authoritative; the first entry is the person a row leads with.
  personIds: string[];
  date: CalendarDay;
  notes: string | null;
  type: InteractionType;
}

export function involves(interaction: Interaction, personId: string): boolean {
  return interaction.personIds.includes(personId);
}

export interface NotionSnapshot {
  people: Person[];
  households: Household[];
  groups: ContactGroup[];
  relationships: RelationshipLink[];
  interactions: Interaction[];
  // ISO 8601 instant.
  fetchedAt: string;
}

export interface NewPersonDraft {
  name: string;
  phone: string | null;
  email: string | null;
  howIKnowThem: string | null;
  birthday: CalendarDay | null;
  birthYearUnknown: boolean;
}

export interface NewInteractionDraft {
  personId: string;
  type: InteractionType;
  date: CalendarDay;
  summary: string;
  notes: string | null;
}
