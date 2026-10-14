import { addDays, daysBetween, type CalendarDay } from "../calendarDay.js";
import type { Interaction } from "../models.js";

// ~6 weeks, the Close Friend rotation baseline.
export const CLOSE_FRIEND_CADENCE_DAYS = 42;
export const DUE_SOON_WINDOW_DAYS = 7;

export type ContactUrgency = "ok" | "dueSoon" | "overdue";

export interface ContactStatus {
  lastContacted: CalendarDay | null;
  daysSinceContact: number | null;
  urgency: ContactUrgency;
}

function latestDay(interactions: Interaction[]): CalendarDay | null {
  let latest: CalendarDay | null = null;
  for (const interaction of interactions) {
    if (latest === null || interaction.date > latest) latest = interaction.date;
  }
  return latest;
}

// Only close friends can be due or overdue. A close friend with no
// interactions at all is overdue.
export function contactStatus(
  interactions: Interaction[],
  isCloseFriend: boolean,
  today: CalendarDay,
): ContactStatus {
  const last = latestDay(interactions);
  if (last === null) {
    return { lastContacted: null, daysSinceContact: null, urgency: isCloseFriend ? "overdue" : "ok" };
  }
  const days = daysBetween(last, today);
  let urgency: ContactUrgency = "ok";
  if (isCloseFriend && days > CLOSE_FRIEND_CADENCE_DAYS) urgency = "overdue";
  else if (isCloseFriend && days > CLOSE_FRIEND_CADENCE_DAYS - DUE_SOON_WINDOW_DAYS) urgency = "dueSoon";
  return { lastContacted: last, daysSinceContact: days, urgency };
}

// The first day a close friend counts as overdue after their last contact:
// overdue means days > 42, so it's day 43.
export function overdueCrossingDay(lastContacted: CalendarDay): CalendarDay {
  return addDays(lastContacted, CLOSE_FRIEND_CADENCE_DAYS + 1);
}
