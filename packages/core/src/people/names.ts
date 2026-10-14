import type { Person } from "../models.js";

// Finder-style name order, like Swift's localizedStandardCompare:
// case-insensitive and numeric-aware ("Item 2" before "Item 10").
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

export function byName(a: Person, b: Person): number {
  return compareNames(a.name, b.name);
}

// The leading word of a name; empty for a blank name.
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}
