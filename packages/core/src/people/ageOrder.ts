import type { CalendarDay } from "../calendarDay.js";
import type { Person } from "../models.js";
import { compareNames } from "./names.js";

// Shared by the household roster and the connections list so the two can't
// drift: within any group of people, oldest first.

// A birthday with an unknown year carries a placeholder year, so it can only
// answer "when in the year", never "how old". It counts as no age at all
// rather than as someone born in year 1.
export function ageSortDay(person: Person): CalendarDay | null {
  return person.birthday && !person.birthYearUnknown ? person.birthday : null;
}

// Oldest first. Anyone without a usable birth year falls to the end of their
// group, ordered by name. With only about 18% of people carrying a birth
// year, that fallback is the common path, not the edge.
export function olderFirst(a: Person, b: Person): number {
  const left = ageSortDay(a);
  const right = ageSortDay(b);
  if (left && right && left !== right) return left < right ? -1 : 1;
  if (left && !right) return -1;
  if (!left && right) return 1;
  return compareNames(a.name, b.name);
}
