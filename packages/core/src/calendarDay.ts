// A calendar day as "YYYY-MM-DD", with no time and no time zone.
//
// Birthdays and interaction dates are days, not instants. The iOS app modelled
// them as Dates at local midnight, which is only right while the device's zone
// never changes. Here they stay strings, so the server's zone, the browser's
// zone and DST can never move a birthday by a day. The only place a time zone
// enters is converting an instant ("now", or a Notion datetime) into a day,
// and that always names the zone explicitly.
export type CalendarDay = string;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  // Rejects 2026-02-30 and friends, which Date.UTC would quietly roll over.
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}

function parts(day: CalendarDay): { year: number; month: number; day: number } {
  const match = DAY_PATTERN.exec(day);
  if (!match) throw new Error(`Not a calendar day: ${day}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// Day arithmetic runs on UTC midnights, where every day is exactly 24 hours.
function toUtcMs(day: CalendarDay): number {
  const p = parts(day);
  return Date.UTC(p.year, p.month - 1, p.day);
}

function fromUtcMs(ms: number): CalendarDay {
  return new Date(ms).toISOString().slice(0, 10);
}

// Lenient like Swift's Calendar.date(from:): Feb 29 in a non-leap year
// becomes Mar 1. Birthday maths depends on exactly this rollover.
function lenientDay(year: number, month: number, day: number): CalendarDay {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return fromUtcMs(date.getTime());
}

export function addDays(day: CalendarDay, count: number): CalendarDay {
  return fromUtcMs(toUtcMs(day) + count * MS_PER_DAY);
}

// Whole days from `from` to `to`; negative when `to` is earlier.
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function yearOf(day: CalendarDay): number {
  return parts(day).year;
}

// The same month and day in another year, rolling Feb 29 to Mar 1 when that
// year has no Feb 29.
export function inYear(day: CalendarDay, year: number): CalendarDay {
  const p = parts(day);
  return lenientDay(year, p.month, p.day);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

// The calendar day an instant falls on in `timeZone` (an IANA name such as
// "America/Chicago"). Built from the numeric parts rather than a locale's
// formatted string: a Node.js build without full locale data falls back to
// en-US ("10/14/2026"), and that string broke every page that used today.
export function dayOf(instant: Date, timeZone: string): CalendarDay {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      calendar: "gregory",
      numberingSystem: "latn",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${part("year").padStart(4, "0")}-${part("month").padStart(2, "0")}-${part("day").padStart(2, "0")}`;
  if (!isCalendarDay(day)) throw new Error(`Couldn't work out the date in ${timeZone}: got ${day}`);
  return day;
}
