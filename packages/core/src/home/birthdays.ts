import { daysBetween, inYear, yearOf, type CalendarDay } from "../calendarDay.js";
import type { Person } from "../models.js";

// Days from `today` until the next occurrence of `birthday`; 0 when it's
// today. A Feb 29 birthday falls on Mar 1 in years without one.
export function daysUntilNextBirthday(birthday: CalendarDay, today: CalendarDay): number {
  let next = inYear(birthday, yearOf(today));
  if (next < today) next = inYear(birthday, yearOf(today) + 1);
  return daysBetween(today, next);
}

export interface UpcomingBirthday {
  person: Person;
  daysUntil: number;
}

// The single source for both Home's short list and the full birthdays list,
// so "See all" is guaranteed to be a superset of Home's list. Hidden people
// are left out here (notifications deliberately include them).
export function upcomingBirthdays(
  people: Person[],
  today: CalendarDay,
  withinDays: number | null = null,
): UpcomingBirthday[] {
  return people
    .filter((person) => !person.hideFromList && person.birthday !== null)
    .map((person) => ({
      person,
      daysUntil: daysUntilNextBirthday(person.birthday as CalendarDay, today),
    }))
    .filter((entry) => withinDays === null || entry.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}
