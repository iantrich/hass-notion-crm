import { describe, expect, it } from "vitest";
import {
  CONNECTION_RANKING,
  CONNECTION_TYPES,
  makePerson,
  memberRoster,
  sortConnections,
  sortHousehold,
  type CalendarDay,
  type ConnectionType,
  type Person,
  type PersonConnection,
  type RelationshipLink,
} from "../src/index.js";

function person(id: string, name: string, born: CalendarDay | null = null, birthYearUnknown = false): Person {
  return makePerson(id, name, { birthday: born, birthYearUnknown });
}

// personIds[1] is the connectionType of personIds[0]: "Child" means
// personIds[1] is the child of personIds[0].
function link(a: string, b: string, type: ConnectionType): RelationshipLink {
  return { id: `${a}-${b}`, personIds: [a, b], connectionType: type, notes: null };
}

describe("household order", () => {
  const sorted = (people: Person[], links: RelationshipLink[]) =>
    sortHousehold(people, people.map((p) => p.id), links, (p) => p).map((p) => p.name);

  it("puts parents before children", () => {
    const people = [person("kid", "Zoe Kid", "2015-01-01"), person("mom", "Anna Mom", "1980-01-01")];
    expect(sorted(people, [link("mom", "kid", "Child")])).toEqual(["Anna Mom", "Zoe Kid"]);
  });

  it("tiers a parent link stored the other way round", () => {
    const people = [person("kid", "Zoe Kid", "2015-01-01"), person("mom", "Anna Mom", "1980-01-01")];
    expect(sorted(people, [link("kid", "mom", "Parent")])).toEqual(["Anna Mom", "Zoe Kid"]);
  });

  it("orders oldest first within a tier", () => {
    const people = [
      person("c2", "Younger Kid", "2015-06-01"),
      person("c1", "Older Kid", "2012-03-01"),
      person("p1", "Parent", "1980-01-01"),
    ];
    expect(sorted(people, [link("p1", "c1", "Child"), link("p1", "c2", "Child")])).toEqual([
      "Parent",
      "Older Kid",
      "Younger Kid",
    ]);
  });

  it("puts members without a birthday after those with one", () => {
    const people = [
      person("c2", "Andy NoBirthday"),
      person("c1", "Zed HasBirthday", "2012-03-01"),
      person("p1", "Parent", "1980-01-01"),
    ];
    expect(sorted(people, [link("p1", "c1", "Child"), link("p1", "c2", "Child")])).toEqual([
      "Parent",
      "Zed HasBirthday",
      "Andy NoBirthday",
    ]);
  });

  it("treats an unknown birth year as no age", () => {
    // A month/day-only birthday must not sort as a year-1 birth.
    const people = [
      person("c1", "Zed YearUnknown", "0001-03-14", true),
      person("c2", "Andy KnownYear", "2012-03-01"),
      person("p1", "Parent", "1980-01-01"),
    ];
    expect(sorted(people, [link("p1", "c1", "Child"), link("p1", "c2", "Child")])).toEqual([
      "Parent",
      "Andy KnownYear",
      "Zed YearUnknown",
    ]);
  });

  it("breaks ties between unknown ages alphabetically", () => {
    const people = [person("c2", "Zoe"), person("c1", "Adam"), person("p1", "Parent", "1980-01-01")];
    expect(sorted(people, [link("p1", "c1", "Child"), link("p1", "c2", "Child")])).toEqual(["Parent", "Adam", "Zoe"]);
  });

  it("tiers someone who is both parent and child as a parent", () => {
    const people = [person("kid", "Kid", "2015-01-01"), person("middle", "Middle", "1980-01-01"), person("gran", "Gran", "1950-01-01")];
    expect(sorted(people, [link("gran", "middle", "Child"), link("middle", "kid", "Child")])).toEqual(["Gran", "Middle", "Kid"]);
  });

  it("puts unplaced members between parents and children", () => {
    const people = [person("kid", "Kid", "2015-01-01"), person("lodger", "Lodger", "1990-01-01"), person("mom", "Mom", "1980-01-01")];
    expect(sorted(people, [link("mom", "kid", "Child")])).toEqual(["Mom", "Lodger", "Kid"]);
  });

  it("ranks a parent above an older unplaced member", () => {
    // Every other case has the parents oldest, so age alone would pass them.
    // Here only the tier puts the young parent ahead of the older lodger.
    const people = [person("kid", "Kid", "2015-01-01"), person("lodger", "Lodger", "1950-01-01"), person("mom", "Mom", "1985-01-01")];
    expect(sorted(people, [link("mom", "kid", "Child")])).toEqual(["Mom", "Lodger", "Kid"]);
  });

  it("falls back to age then name with no parent/child links", () => {
    expect(sorted([person("b", "Bob"), person("a", "Alice")], [])).toEqual(["Alice", "Bob"]);
  });

  it("doesn't create tiers from spouse links", () => {
    const people = [person("b", "Zed Spouse", "1975-01-01"), person("a", "Amy Spouse", "1985-01-01")];
    expect(sorted(people, [link("a", "b", "Spouse")])).toEqual(["Zed Spouse", "Amy Spouse"]);
  });

  it("tiers from the full membership even when someone isn't displayed", () => {
    const mom = person("mom", "Mom", "1980-01-01");
    const sibling = person("sib", "Sibling", "2010-01-01");
    const links = [link("mom", "me", "Child"), link("mom", "sib", "Child")];
    const displayed = sortHousehold([sibling, mom], ["mom", "sib", "me"], links, (p) => p);
    expect(displayed.map((p) => p.name)).toEqual(["Mom", "Sibling"]);
  });

  it("orders any row type that carries a person", () => {
    const rows = [{ person: person("kid", "Kid", "2015-01-01") }, { person: person("mom", "Mom", "1980-01-01") }];
    const result = sortHousehold(rows, ["mom", "kid"], [link("mom", "kid", "Child")], (r) => r.person);
    expect(result.map((r) => r.person.name)).toEqual(["Mom", "Kid"]);
  });
});

describe("connection order", () => {
  function row(name: string, type: ConnectionType | null, born: CalendarDay | null = null, yearUnknown = false): PersonConnection {
    return { person: person(name, name, born, yearUnknown), connectionType: type };
  }
  const order = (rows: PersonConnection[]) => sortConnections(rows).map((r) => r.person.name);

  it("holds the requested sequence", () => {
    // Supplied in reverse so alphabetical order can't fake it.
    expect(
      order([row("Nibling", "Nibling"), row("SiblingInLaw", "Sibling-in-law"), row("Pibling", "Pibling"), row("Parent", "Parent")]),
    ).toEqual(["Parent", "Pibling", "SiblingInLaw", "Nibling"]);
  });

  it("puts older generations before younger", () => {
    expect(
      order([
        row("Grandchild", "Grandchild"),
        row("Child", "Child"),
        row("Sibling", "Sibling"),
        row("Parent", "Parent"),
        row("Grandparent", "Grandparent"),
      ]),
    ).toEqual(["Grandparent", "Parent", "Sibling", "Child", "Grandchild"]);
  });

  it("leads with closer relations within a generation", () => {
    expect(order([row("Pibling", "Pibling"), row("ParentInLaw", "Parent-in-law"), row("Parent", "Parent")])).toEqual([
      "Parent",
      "ParentInLaw",
      "Pibling",
    ]);
  });

  it("puts family before friends and colleagues", () => {
    expect(order([row("Coworker", "Coworker"), row("Friend", "Friend"), row("Nibling", "Nibling")])).toEqual([
      "Nibling",
      "Friend",
      "Coworker",
    ]);
  });

  it("sorts catch-all types last, and no type after them", () => {
    expect(order([row("Other", "Other"), row("Extended", "Extended Family"), row("Friend", "Friend")])).toEqual([
      "Friend",
      "Extended",
      "Other",
    ]);
    expect(order([row("NoType", null), row("Other", "Other"), row("Parent", "Parent")])).toEqual(["Parent", "Other", "NoType"]);
  });

  it("ranks Grandparent first, not as missing", () => {
    // Rank 0 is falsy; it must not fall through to the no-type rank.
    expect(order([row("NoType", null), row("Grandparent", "Grandparent")])).toEqual(["Grandparent", "NoType"]);
  });

  it("breaks same-type ties by age, then name", () => {
    expect(order([row("Younger", "Sibling", "1990-01-01"), row("Older", "Sibling", "1975-01-01")])).toEqual(["Older", "Younger"]);
    expect(order([row("Adam", "Sibling"), row("Zoe", "Sibling", "1975-01-01"), row("Bea", "Sibling")])).toEqual([
      "Zoe",
      "Adam",
      "Bea",
    ]);
    expect(order([row("YearUnknown", "Sibling", "0001-03-14", true), row("KnownYear", "Sibling", "1990-01-01")])).toEqual([
      "KnownYear",
      "YearUnknown",
    ]);
  });

  it("ranks every connection type exactly once", () => {
    expect([...CONNECTION_RANKING].sort()).toEqual([...CONNECTION_TYPES].sort());
  });
});

describe("member roster", () => {
  const people = [person("a", "Ada"), person("b", "Bo"), person("c", "Cy")];

  it("resolves member ids to people, by name", () => {
    expect(memberRoster(["b", "a"], people).map((p) => p.id)).toEqual(["a", "b"]);
    expect(
      memberRoster(["z", "a", "m"], [person("z", "Zoe"), person("a", "Alice"), person("m", "Mark")]).map((p) => p.name),
    ).toEqual(["Alice", "Mark", "Zoe"]);
  });

  it("skips unknown ids and duplicates", () => {
    expect(memberRoster(["a", "ghost"], people).map((p) => p.id)).toEqual(["a"]);
    expect(memberRoster(["a", "a"], people)).toHaveLength(1);
    expect(memberRoster([], people)).toEqual([]);
  });

  it("orders numerically and ignores case", () => {
    expect(memberRoster(["2", "10", "x"], [person("2", "Item 2"), person("10", "Item 10"), person("x", "item 1")]).map((p) => p.name)).toEqual([
      "item 1",
      "Item 2",
      "Item 10",
    ]);
  });
});
