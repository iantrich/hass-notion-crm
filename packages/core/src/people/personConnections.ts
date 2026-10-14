import type {
  ConnectionType,
  ContactGroup,
  Household,
  Person,
  RelationshipLink,
} from "../models.js";
import { connectionTypeRelativeTo } from "../models.js";
import { sortConnections, type PersonConnection } from "./connectionOrder.js";
import { sortHousehold } from "./householdOrder.js";
import { compareNames } from "./names.js";

// The Connections section of a person's screen: their household, everyone
// else they're related to, and the groups they belong to.
export interface PersonConnections {
  // The household itself, not just its name: the section heading links to it.
  household: Household | null;
  householdMembers: PersonConnection[];
  others: PersonConnection[];
  groups: ContactGroup[];
}

export function isEmptyConnections(connections: PersonConnections): boolean {
  return (
    connections.householdMembers.length === 0 &&
    connections.others.length === 0 &&
    connections.groups.length === 0
  );
}

export interface ConnectionsInput {
  people: Person[];
  households: Household[];
  groups: ContactGroup[];
  relationships: RelationshipLink[];
  // Ian's own person id, which never appears as someone's connection.
  excludedId: string;
}

export function buildPersonConnections(personId: string, input: ConnectionsInput): PersonConnections {
  const { people, households, groups, relationships, excludedId } = input;
  const peopleById = new Map<string, Person>();
  for (const person of people) if (!peopleById.has(person.id)) peopleById.set(person.id, person);

  // The first relationship to a given person wins. Duplicate pairs exist in
  // the live data and would otherwise render as repeated rows.
  const typeByPersonId = new Map<string, ConnectionType>();
  const partnerIds: string[] = [];
  for (const link of relationships) {
    if (!link.personIds.includes(personId)) continue;
    // The link's other end; undefined for a self-referencing row.
    const otherId = link.personIds.find((id) => id !== personId);
    // Excluded by person, not by link: on Ian's own screen the subject is the
    // excluded id, and he should still see his people.
    if (otherId === undefined || otherId === excludedId || typeByPersonId.has(otherId)) continue;
    const type = connectionTypeRelativeTo(link, personId);
    if (type === null) continue;
    typeByPersonId.set(otherId, type);
    partnerIds.push(otherId);
  }

  const toConnection = (id: string): PersonConnection | null => {
    const person = peopleById.get(id);
    return person ? { person, connectionType: typeByPersonId.get(id) ?? null } : null;
  };

  const placed = new Set<string>([personId]);
  const household = households.find((h) => h.memberIds.includes(personId)) ?? null;
  const visibleMembers: PersonConnection[] = [];
  for (const id of household?.memberIds ?? []) {
    if (id === excludedId || placed.has(id)) continue;
    placed.add(id);
    const connection = toConnection(id);
    if (connection) visibleMembers.push(connection);
  }
  // Tiered against the household's FULL membership, not the filtered rows:
  // this person and any excluded one are hidden from the list but are still
  // the links that place everybody else.
  const householdMembers = sortHousehold(
    visibleMembers,
    household?.memberIds ?? [],
    relationships,
    (row) => row.person,
  );

  const others = sortConnections(
    partnerIds
      .filter((id) => !placed.has(id))
      .map(toConnection)
      .filter((row): row is PersonConnection => row !== null),
  );

  return {
    // Dropped when nobody is left to list under it, so the view never draws a
    // household heading over an empty group.
    household: householdMembers.length === 0 ? null : household,
    householdMembers,
    others,
    groups: groups
      .filter((group) => group.memberIds.includes(personId))
      .sort((a, b) => compareNames(a.name, b.name)),
  };
}
