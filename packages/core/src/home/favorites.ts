import type { Person } from "../models.js";

// Two rows of three.
export const MAX_FAVORITES = 6;

// Source order is kept deliberately: Notion lists these spouse first, then
// children by age, which sorting by name would scramble.
export function favorites(people: Person[]): Person[] {
  return people.filter((p) => p.isFavorite && !p.hideFromList).slice(0, MAX_FAVORITES);
}
