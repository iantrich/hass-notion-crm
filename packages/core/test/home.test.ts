import { describe, expect, it } from "vitest";
import {
  addDays,
  daysUntilNextBirthday,
  favorites,
  firstName,
  interactionPeople,
  interactionPeopleSummary,
  makePerson,
  upcomingBirthdays,
  visibleInteractions,
  type Interaction,
  type Person,
} from "../src/index.js";

const today = "2026-08-21";

describe("birthdays", () => {
  it("counts days to the next occurrence, 0 for today", () => {
    expect(daysUntilNextBirthday("2019-08-21", today)).toBe(0);
    expect(daysUntilNextBirthday("1990-08-22", today)).toBe(1);
    // Already passed this year: next year's.
    expect(daysUntilNextBirthday("1990-08-20", today)).toBe(364);
  });

  it("puts Feb 29 on Mar 1 in years without one", () => {
    expect(daysUntilNextBirthday("2000-02-29", "2026-02-25")).toBe(4);
    expect(daysUntilNextBirthday("2000-02-29", "2028-02-25")).toBe(4);
  });

  it("lists upcoming birthdays soonest first, without hidden people", () => {
    const people = [
      makePerson("a", "Later", { birthday: "1990-09-10" }),
      makePerson("b", "Sooner", { birthday: "1990-08-25" }),
      makePerson("c", "Hidden", { birthday: "2015-08-22", hideFromList: true }),
      makePerson("d", "Unknown"),
    ];
    expect(upcomingBirthdays(people, today).map((e) => [e.person.name, e.daysUntil])).toEqual([
      ["Sooner", 4],
      ["Later", 20],
    ]);
    expect(upcomingBirthdays(people, today, 10).map((e) => e.person.name)).toEqual(["Sooner"]);
  });
});

describe("favorites", () => {
  const fav = (id: string, name: string, overrides: Partial<Person> = {}) => makePerson(id, name, { isFavorite: true, ...overrides });

  it("includes only visible favorites", () => {
    expect(favorites([fav("a", "Ada"), fav("b", "Bo", { isFavorite: false })]).map((p) => p.id)).toEqual(["a"]);
    // Hide From List wins over Favorite, as in every other day-to-day view.
    expect(favorites([fav("a", "Ada"), fav("b", "Bo", { hideFromList: true })]).map((p) => p.id)).toEqual(["a"]);
  });

  it("holds at most two rows of three, in source order", () => {
    const nine = Array.from({ length: 9 }, (_, i) => fav(`p${i}`, `Person ${i}`));
    expect(favorites(nine)).toHaveLength(6);
    // Notion's order is meaningful (spouse, then children by age).
    const family = [fav("c", "Chelsea"), fav("m", "Melodi"), fav("z", "Maisey"), fav("r", "Mera")];
    expect(favorites(family).map((p) => p.name)).toEqual(["Chelsea", "Melodi", "Maisey", "Mera"]);
  });

  it("uses the leading word as the first name", () => {
    expect(firstName("Tom Barnicle")).toBe("Tom");
    expect(firstName("Courtney")).toBe("Courtney");
    expect(firstName("Casey Crnkovich-Knight")).toBe("Casey");
    expect(firstName("  Mera Richardson ")).toBe("Mera");
    expect(firstName("   ")).toBe("");
  });
});

describe("interaction feed", () => {
  const person = (id: string, hidden = false) => makePerson(id, id, { hideFromList: hidden });
  const interaction = (id: string, personIds: string[], daysAgo: number): Interaction => ({
    id,
    summary: id,
    personIds,
    date: addDays(today, -daysAgo),
    notes: null,
    type: "Catch-up",
  });
  const feed = (interactions: Interaction[], people: Person[], options: { since?: string; limit?: number } = {}) =>
    visibleInteractions(interactions, people, { limit: 10, ...options }).map((i) => i.id);

  it("hides an interaction whose only person is hidden", () => {
    expect(feed([interaction("i1", ["ghost"], 1)], [person("ghost", true)])).toEqual([]);
  });

  it("keeps an interaction when anyone on it is visible", () => {
    expect(feed([interaction("i1", ["ghost", "adam"], 1)], [person("ghost", true), person("adam")])).toEqual(["i1"]);
  });

  it("drops an interaction whose people are all unknown", () => {
    expect(feed([interaction("i1", ["nobody"], 1)], [person("adam")])).toEqual([]);
  });

  it("sorts newest first, then applies the limit", () => {
    const all = [interaction("old", ["adam"], 30), interaction("new", ["adam"], 1), interaction("mid", ["adam"], 10)];
    expect(feed(all, [person("adam")])).toEqual(["new", "mid", "old"]);
    expect(feed(all, [person("adam")], { limit: 2 })).toEqual(["new", "mid"]);
  });

  it("drops interactions before the cutoff", () => {
    const all = [interaction("old", ["adam"], 45), interaction("new", ["adam"], 5)];
    expect(feed(all, [person("adam")], { since: addDays(today, -30) })).toEqual(["new"]);
  });

  it("resolves people in relation order, skipping unknown ids", () => {
    const people = [person("kendra"), person("adam")];
    expect(interactionPeople(interaction("i1", ["adam", "kendra"], 1), people).map((p) => p.id)).toEqual(["adam", "kendra"]);
    expect(interactionPeople(interaction("i1", ["nobody", "adam"], 1), people).map((p) => p.id)).toEqual(["adam"]);
  });
});

describe("interaction people summary", () => {
  const names = (...list: string[]) => interactionPeopleSummary(list.map((n) => makePerson(n, n)));

  it("names one person in full", () => {
    expect(names("Adam McLaughlin")).toBe("Adam McLaughlin");
  });

  it("joins two first names", () => {
    expect(names("Adam McLaughlin", "Kendra Swehla")).toBe("Adam & Kendra");
    expect(names("Cher", "Prince")).toBe("Cher & Prince");
  });

  it("leads with one name and counts the rest past two", () => {
    expect(names("Adam McLaughlin", "Kendra Swehla", "Mark Swehla")).toBe("Adam and 2 others");
    expect(names("Adam McLaughlin", "Kendra Swehla", "Mark Swehla", "Priya Shah")).toBe("Adam and 3 others");
  });

  it("is empty with nobody", () => {
    expect(names()).toBe("");
  });
});
