import { describe, expect, it } from "vitest";
import {
  birthdayNotification,
  journalNotification,
  makePerson,
  nameList,
  notificationFor,
  notificationRoute,
  overdueNotification,
  type Interaction,
  type Person,
} from "../src/index.js";

const today = "2026-08-21";
const person = (id: string, name: string, overrides: Partial<Person> = {}) => makePerson(id, name, overrides);
const interaction = (id: string, personIds: string[], date: string): Interaction => ({
  id,
  summary: "Catch-up",
  personIds,
  date,
  notes: null,
  type: "Catch-up",
});

describe("birthday notification", () => {
  it("names a single birthday in the title", () => {
    expect(birthdayNotification([person("1", "Mera Richardson", { birthday: "2019-08-21" })], today)).toEqual({
      id: "thread.birthday.2026-08-21",
      kind: "birthday",
      title: "🎂 Mera Richardson's birthday",
      body: "",
      personIds: ["1"],
    });
  });

  it("collapses several into one", () => {
    const people = [
      person("1", "Mera Richardson", { birthday: "2019-08-21" }),
      person("2", "Tony Szeszycki", { birthday: "1980-08-21" }),
      person("3", "Sean Murphy", { birthday: "1979-08-21" }),
    ];
    const notification = birthdayNotification(people, today);
    expect(notification?.title).toBe("🎂 3 birthdays today");
    expect(notification?.body).toBe("Mera Richardson, Sean Murphy, Tony Szeszycki");
  });

  it("includes hidden people", () => {
    expect(birthdayNotification([person("1", "Hidden Kid", { birthday: "2015-08-21", hideFromList: true })], today)).not.toBeNull();
  });

  it("fires a Feb 29 birthday on Mar 1 in a year without one", () => {
    const leap = [person("1", "Leap Baby", { birthday: "2000-02-29" })];
    expect(birthdayNotification(leap, "2026-03-01")?.id).toBe("thread.birthday.2026-03-01");
    expect(birthdayNotification(leap, "2026-02-28")).toBeNull();
    expect(birthdayNotification(leap, "2028-02-29")).not.toBeNull();
    expect(birthdayNotification(leap, "2028-03-01")).toBeNull();
  });

  it("sends nothing on a day without birthdays", () => {
    expect(birthdayNotification([person("1", "Other Day", { birthday: "1990-12-25" }), person("2", "None")], today)).toBeNull();
  });

  it("truncates a long name list", () => {
    const people = ["Ann", "Bob", "Cal", "Dee", "Eve", "Fay"].map((name, i) => person(`${i}`, name, { birthday: "1990-08-21" }));
    expect(birthdayNotification(people, today)?.body).toBe("Ann, Bob, Cal, Dee +2 more");
    expect(nameList(["A", "B", "C", "D"])).toBe("A, B, C, D");
  });
});

describe("overdue notification", () => {
  const friend = (id: string, name: string, overrides: Partial<Person> = {}) => person(id, name, { isCloseFriend: true, ...overrides });

  it("fires 43 days after the last interaction", () => {
    // 42 days is still due soon (overdue means > 42), so day 43 is the first
    // overdue day: 2026-07-10 + 43 days = 2026-08-22.
    const people = [friend("1", "Adam McLaughlin")];
    const interactions = [interaction("i1", ["1"], "2026-07-10")];
    expect(overdueNotification(people, interactions, "2026-08-21")).toBeNull();
    expect(overdueNotification(people, interactions, "2026-08-22")).toEqual({
      id: "thread.overdue.2026-08-22",
      kind: "overdue",
      title: "Adam McLaughlin just passed 6 weeks",
      body: "",
      personIds: ["1"],
    });
    // One alert per episode: the day after, it's silent again.
    expect(overdueNotification(people, interactions, "2026-08-23")).toBeNull();
  });

  it("skips close friends with no interactions, hidden ones and everyone else", () => {
    const interactions = [interaction("i1", ["2", "3"], "2026-07-10")];
    const people = [friend("1", "Never Seen"), friend("2", "Hidden", { hideFromList: true }), person("3", "Acquaintance")];
    expect(overdueNotification(people, interactions, "2026-08-22")).toBeNull();
  });

  // A group dinner is contact with everyone at it.
  it("counts a shared interaction for everyone on it", () => {
    const people = [friend("1", "Adam McLaughlin"), friend("2", "Michael Golden")];
    const notification = overdueNotification(people, [interaction("i1", ["1", "2"], "2026-07-10")], "2026-08-22");
    expect(notification?.title).toBe("2 close friends just passed 6 weeks");
    expect(notification?.body).toBe("Adam McLaughlin, Michael Golden");
  });

  it("counts only the most recent interaction", () => {
    const people = [friend("1", "Adam McLaughlin")];
    const interactions = [interaction("i1", ["1"], "2026-01-01"), interaction("i2", ["1"], "2026-07-10")];
    expect(overdueNotification(people, interactions, "2026-08-22")).not.toBeNull();
    expect(overdueNotification(people, interactions, "2026-02-13")).toBeNull();
  });
});

describe("journal notification", () => {
  it("reminds when nothing is logged today", () => {
    expect(journalNotification([], today)).toEqual({
      id: "thread.journal.2026-08-21",
      kind: "journal",
      title: "Log today's interactions",
      body: "Anyone you talked to today?",
      personIds: [],
    });
  });

  it("is skipped when something is logged today, not yesterday", () => {
    expect(journalNotification([interaction("i1", ["1"], today)], today)).toBeNull();
    expect(journalNotification([interaction("i1", ["1"], "2026-08-20")], today)).not.toBeNull();
  });
});

describe("notificationFor", () => {
  it("dispatches by kind with unique ids", () => {
    const people = [
      person("1", "Mera Richardson", { birthday: "2019-08-22" }),
      person("2", "Adam McLaughlin", { isCloseFriend: true }),
    ];
    const interactions = [interaction("i1", ["2"], "2026-07-10")];
    const day = "2026-08-22";
    const all = (["birthday", "overdue", "journal"] as const).map((kind) => notificationFor(kind, people, interactions, day));
    expect(all.map((n) => n?.kind)).toEqual(["birthday", "overdue", "journal"]);
    expect(new Set(all.map((n) => n?.id)).size).toBe(3);
  });
});

describe("notificationRoute", () => {
  it("opens the person when there's one, the list when there are several", () => {
    expect(notificationRoute({ kind: "birthday", personIds: ["p 1"] })).toBe("/person/p%201");
    expect(notificationRoute({ kind: "birthday", personIds: ["a", "b"] })).toBe("/birthdays");
    expect(notificationRoute({ kind: "overdue", personIds: ["a"] })).toBe("/person/a");
    expect(notificationRoute({ kind: "overdue", personIds: ["a", "b"] })).toBe("/reach-out");
    expect(notificationRoute({ kind: "journal", personIds: [] })).toBe("");
  });
});
