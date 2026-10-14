import type { CalendarDay } from "../calendarDay.js";
import type { Interaction, Person } from "../models.js";
import { daysUntilNextBirthday } from "../home/birthdays.js";
import { overdueCrossingDay } from "../contact/contactStatus.js";

// The three daily notifications. The iOS app had to plan 30 days ahead
// because it couldn't run in the background; the server can decide at fire
// time, so each function answers "what, if anything, goes out today?"

export type NotificationKind = "birthday" | "overdue" | "journal";

// Local fire times, in Home Assistant's time zone.
export const NOTIFICATION_HOURS: Record<NotificationKind, number> = {
  birthday: 10,
  overdue: 15,
  journal: 21,
};

export interface DailyNotification {
  // Stable per kind and day ("thread.birthday.2026-08-21"), so the scheduler
  // can record what it has already sent and never send it twice.
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  // Who it's about, so a tap can open the right screen: a single person
  // opens their page, several open the matching list.
  personIds: string[];
}

const MAX_NAMES_IN_BODY = 4;

export function nameList(names: string[]): string {
  if (names.length <= MAX_NAMES_IN_BODY) return names.join(", ");
  const shown = names.slice(0, MAX_NAMES_IN_BODY).join(", ");
  return `${shown} +${names.length - MAX_NAMES_IN_BODY} more`;
}

// One notification per kind per day, however many people it covers: "3
// birthdays today" beats three separate alerts on the Lock Screen.
function collapsed(
  kind: NotificationKind,
  today: CalendarDay,
  people: Person[],
  title: (names: string[]) => string,
): DailyNotification | null {
  if (people.length === 0) return null;
  const names = people.map((p) => p.name).sort();
  return {
    id: `thread.${kind}.${today}`,
    kind,
    title: title(names),
    // A single name is already in the title; repeating it as the body reads
    // like a stutter on the Lock Screen.
    body: names.length === 1 ? "" : nameList(names),
    personIds: people.map((p) => p.id),
  };
}

// Everyone with a birthday today, INCLUDING hidden people: Ian's explicit
// choice, unlike Home and Search. Feb 29 birthdays fire on Mar 1 in years
// without one.
export function birthdayNotification(people: Person[], today: CalendarDay): DailyNotification | null {
  const celebrating = people.filter(
    (p) => p.birthday !== null && daysUntilNextBirthday(p.birthday, today) === 0,
  );
  return collapsed("birthday", today, celebrating, (names) =>
    names.length === 1 ? `🎂 ${names[0]}'s birthday` : `🎂 ${names.length} birthdays today`,
  );
}

// Close friends whose 6-week mark is today: one alert per overdue episode,
// silent until an interaction resets the clock. Hidden people are excluded,
// matching the Reach Out tab, which wouldn't show them. A close friend with
// no interactions has no crossing day, so never appears here.
export function overdueNotification(
  people: Person[],
  interactions: Interaction[],
  today: CalendarDay,
): DailyNotification | null {
  const crossing = people.filter((person) => {
    if (!person.isCloseFriend || person.hideFromList) return false;
    let last: CalendarDay | null = null;
    for (const interaction of interactions) {
      // A shared interaction is contact with everyone on it.
      if (interaction.personIds.includes(person.id) && (last === null || interaction.date > last)) {
        last = interaction.date;
      }
    }
    return last !== null && overdueCrossingDay(last) === today;
  });
  return collapsed("overdue", today, crossing, (names) =>
    names.length === 1
      ? `${names[0]} just passed 6 weeks`
      : `${names.length} close friends just passed 6 weeks`,
  );
}

// The evening reminder, skipped when something is already logged today. The
// server syncs before deciding, so logging in Notion directly counts too.
export function journalNotification(
  interactions: Interaction[],
  today: CalendarDay,
): DailyNotification | null {
  if (interactions.some((i) => i.date === today)) return null;
  return {
    id: `thread.journal.${today}`,
    kind: "journal",
    title: "Log today's interactions",
    body: "Anyone you talked to today?",
    personIds: [],
  };
}

export function notificationFor(
  kind: NotificationKind,
  people: Person[],
  interactions: Interaction[],
  today: CalendarDay,
): DailyNotification | null {
  switch (kind) {
    case "birthday":
      return birthdayNotification(people, today);
    case "overdue":
      return overdueNotification(people, interactions, today);
    case "journal":
      return journalNotification(interactions, today);
  }
}

// The screen a tap on the notification opens, as a Thread route ("" for
// Home): the person when there's one, otherwise the list they come from.
export function notificationRoute(notification: Pick<DailyNotification, "kind" | "personIds">): string {
  const [only, ...rest] = notification.personIds;
  if (only && rest.length === 0) return `/person/${encodeURIComponent(only)}`;
  if (notification.kind === "birthday") return "/birthdays";
  if (notification.kind === "overdue") return "/reach-out";
  return "";
}
