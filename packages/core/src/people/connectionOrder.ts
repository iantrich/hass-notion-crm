import type { ConnectionType, Person } from "../models.js";
import { olderFirst } from "./ageOrder.js";

// One row in a person's Connections: someone, plus how they relate to the
// person whose screen this is. The type is null when a household lists
// someone with no Relationships record behind them.
export interface PersonConnection {
  person: Person;
  connectionType: ConnectionType | null;
}

// Generational: older generations first, then the same generation, then
// younger, then people who aren't family. Within a generation the closer
// relation leads, so a parent precedes a parent-in-law precedes a pibling.
// Extended Family, In-Law and Other say nothing about generation, so they
// sort after everything specific.
export const CONNECTION_RANKING: readonly ConnectionType[] = [
  "Grandparent",
  "Parent",
  "Parent-in-law",
  "Pibling",
  "Spouse",
  "Partner",
  "Ex-Spouse",
  "Sibling",
  "Sibling-in-law",
  "Child",
  "Child-in-law",
  "Nibling",
  "Grandchild",
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
  "Other",
];

const rankByType = new Map(CONNECTION_RANKING.map((type, index) => [type, index]));

// No type at all sorts after every type.
export function connectionRank(type: ConnectionType | null): number {
  const rank = type === null ? undefined : rankByType.get(type);
  return rank ?? CONNECTION_RANKING.length;
}

// Orders the Connections rows outside the household. Household members use
// sortHousehold instead, where generation is derived from the family
// structure rather than inferred from a label.
export function sortConnections(connections: readonly PersonConnection[]): PersonConnection[] {
  return [...connections].sort((a, b) => {
    const rankDiff = connectionRank(a.connectionType) - connectionRank(b.connectionType);
    return rankDiff !== 0 ? rankDiff : olderFirst(a.person, b.person);
  });
}
