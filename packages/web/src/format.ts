import { daysBetween, inYear, yearOf, type CalendarDay } from "@thread/core";

// Calendar days are formatted as UTC midnights with a UTC formatter, so the
// browser's own time zone can never shift the day shown.
function asUtc(day: CalendarDay): Date {
  return new Date(`${day}T00:00:00Z`);
}

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthDayYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

// "Oct 14"
export const formatMonthDay = (day: CalendarDay) => monthDay.format(asUtc(day));
// "Oct 14, 2026"
export const formatMonthDayYear = (day: CalendarDay) => monthDayYear.format(asUtc(day));
// "October 14, 2026"
export const formatLongDate = (day: CalendarDay) => longDate.format(asUtc(day));

// Whole years from `birthday` to `today`.
export function ageOn(birthday: CalendarDay, today: CalendarDay): number {
  const years = yearOf(today) - yearOf(birthday);
  return inYear(birthday, yearOf(today)) > today ? years - 1 : years;
}

// "Oct 7" for a birthday with an unknown year, otherwise "Oct 7, 1987 - 39",
// as the iOS person screen shows it.
export function birthLine(birthday: CalendarDay, birthYearUnknown: boolean, today: CalendarDay): string {
  if (birthYearUnknown) return formatMonthDay(birthday);
  return `${formatMonthDay(birthday)}, ${yearOf(birthday)} - ${ageOn(birthday, today)}`;
}

// "In 3 days", "In 1 day", "Today".
export function untilLabel(days: number): string {
  if (days === 0) return "Today";
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

// "5 minutes ago" for an ISO instant.
export function ago(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 60) return rtf.format(-seconds, "second");
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86_400) return rtf.format(-Math.round(seconds / 3600), "hour");
  return rtf.format(-Math.round(seconds / 86_400), "day");
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export { daysBetween };
