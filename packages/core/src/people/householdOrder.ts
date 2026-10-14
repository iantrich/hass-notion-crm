import type { RelationshipLink } from "../models.js";
import type { Person } from "../models.js";
import { olderFirst } from "./ageOrder.js";

// Orders a household's members by generation: parents, then anyone the
// relationship data can't place, then children, each tier oldest to youngest.
//
// Groups deliberately do NOT use this. A group like "Harrison" is 58 people
// with no family structure, so the member roster's alphabetical order stays.

// The values are the sort order. The middle tier is where members land when
// no parent/child link places them: 21 of 78 live households, which stay
// effectively alphabetical.
const Tier = { parent: 0, unplaced: 1, child: 2 } as const;
type Tier = (typeof Tier)[keyof typeof Tier];

function tiers(memberIds: string[], relationships: RelationshipLink[]): Map<string, Tier> {
  const members = new Set(memberIds);
  const parents = new Set<string>();
  const children = new Set<string>();

  for (const link of relationships) {
    // Only links whose BOTH ends are inside this household say anything about
    // its internal structure.
    if (link.personIds.length !== 2) continue;
    const [first, second] = link.personIds as [string, string];
    if (!members.has(first) || !members.has(second)) continue;

    // personIds[1] is the connectionType of personIds[0], so "Child" means
    // second is the child of first.
    if (link.connectionType === "Child") {
      parents.add(first);
      children.add(second);
    } else if (link.connectionType === "Parent") {
      parents.add(second);
      children.add(first);
    }
  }

  const result = new Map<string, Tier>();
  for (const id of memberIds) {
    // Parent wins the tie: in a three-generation household the middle person
    // is both, and they belong with the adults.
    if (parents.has(id)) result.set(id, Tier.parent);
    else if (children.has(id)) result.set(id, Tier.child);
    else result.set(id, Tier.unplaced);
  }
  return result;
}

// Sorts any row type that carries a Person. `memberIds` is the household's
// FULL membership, which is not always what is being sorted: the person
// detail card hides the subject, and dropping them from the membership would
// erase the very links that tier everyone else.
export function sortHousehold<T>(
  items: readonly T[],
  memberIds: string[],
  relationships: RelationshipLink[],
  personOf: (item: T) => Person,
): T[] {
  const tierById = tiers(memberIds, relationships);
  return [...items].sort((a, b) => {
    const left = personOf(a);
    const right = personOf(b);
    const leftTier = tierById.get(left.id) ?? Tier.unplaced;
    const rightTier = tierById.get(right.id) ?? Tier.unplaced;
    if (leftTier !== rightTier) return leftTier - rightTier;
    return olderFirst(left, right);
  });
}
