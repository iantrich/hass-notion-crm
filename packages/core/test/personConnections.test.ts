import { describe, expect, it } from "vitest";
import {
  buildPersonConnections,
  isEmptyConnections,
  makePerson,
  type ContactGroup,
  type Household,
  type Person,
  type RelationshipLink,
} from "../src/index.js";

const me = "ian";
const capitalized = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const person = (id: string, birthday: string | null = null): Person =>
  makePerson(id, capitalized(id), { birthday });
const household = (name: string, memberIds: string[]): Household => ({
  id: "h",
  name,
  memberIds,
  notionPageUrl: null,
  photoUrl: null,
});
const group = (id: string, memberIds: string[]): ContactGroup => ({
  id,
  name: capitalized(id),
  description: null,
  memberIds,
  notionPageUrl: null,
  photoUrl: null,
});
const link = (id: string, a: string, b: string, type: RelationshipLink["connectionType"]): RelationshipLink => ({
  id,
  personIds: [a, b],
  connectionType: type,
  notes: null,
});

function build(
  personId: string,
  people: Person[],
  { households = [], groups = [], relationships = [] }: { households?: Household[]; groups?: ContactGroup[]; relationships?: RelationshipLink[] } = {},
) {
  return buildPersonConnections(personId, { people, households, groups, relationships, excludedId: me });
}

describe("household", () => {
  it("groups members under the household", () => {
    const result = build("mark", [person("mark"), person("kendra"), person("lucy")], {
      households: [household("Mark & Kendra Swehla", ["mark", "kendra", "lucy"])],
    });
    expect(result.household?.name).toBe("Mark & Kendra Swehla");
    expect(result.householdMembers.map((r) => r.person.id)).toEqual(["kendra", "lucy"]);
  });

  it("doesn't list the subject among their own household", () => {
    const result = build("mark", [person("mark"), person("kendra")], { households: [household("Swehla", ["mark", "kendra"])] });
    expect(result.householdMembers.some((r) => r.person.id === "mark")).toBe(false);
  });

  it("is alphabetical with no relationship data", () => {
    const result = build("mark", [person("mark"), person("kendra"), person("lucy")], {
      households: [household("Swehla", ["mark", "lucy", "kendra"])],
    });
    expect(result.householdMembers.map((r) => r.person.id)).toEqual(["kendra", "lucy"]);
  });

  it("orders parents before children", () => {
    const result = build("mark", [person("mark"), person("dana", "1980-01-01"), person("alex", "2015-01-01")], {
      households: [household("Swehla", ["mark", "alex", "dana"])],
      relationships: [link("r", "dana", "alex", "Child")],
    });
    // Alphabetically Alex precedes Dana; being the parent puts Dana first.
    expect(result.householdMembers.map((r) => r.person.id)).toEqual(["dana", "alex"]);
  });

  it("is absent for someone with no household", () => {
    const result = build("mark", [person("mark")]);
    expect(result.household).toBeNull();
    expect(result.householdMembers).toEqual([]);
  });

  it("carries each member's connection type, or null without a record", () => {
    const withType = build("mark", [person("mark"), person("lucy")], {
      households: [household("Swehla", ["mark", "lucy"])],
      relationships: [link("r", "mark", "lucy", "Child")],
    });
    expect(withType.householdMembers[0]?.connectionType).toBe("Child");
    const without = build("mark", [person("mark"), person("lucy")], { households: [household("Swehla", ["mark", "lucy"])] });
    expect(without.householdMembers[0]?.connectionType).toBeNull();
  });
});

describe("others", () => {
  it("orients the type from the subject's side", () => {
    // "lucy is the child of mark", so on Lucy's screen Mark is her Parent.
    const result = build("lucy", [person("mark"), person("lucy")], { relationships: [link("r", "mark", "lucy", "Child")] });
    expect(result.others[0]?.connectionType).toBe("Parent");
  });

  it("holds relationships outside the household, without repeating members", () => {
    const result = build("mark", [person("mark"), person("kendra"), person("tony")], {
      households: [household("Swehla", ["mark", "kendra"])],
      relationships: [link("r1", "mark", "kendra", "Spouse"), link("r2", "mark", "tony", "Coworker")],
    });
    expect(result.householdMembers.map((r) => r.person.id)).toEqual(["kendra"]);
    expect(result.others.map((r) => r.person.id)).toEqual(["tony"]);
  });

  it("sorts same-type connections by name", () => {
    const result = build("mark", [person("mark"), person("zoe"), person("alice")], {
      relationships: [link("r1", "mark", "zoe", "Friend"), link("r2", "mark", "alice", "Friend")],
    });
    expect(result.others.map((r) => r.person.id)).toEqual(["alice", "zoe"]);
  });

  it("excludes Ian from others and from household members", () => {
    expect(build("mark", [person("mark"), person(me)], { relationships: [link("r", "mark", me, "College Friend")] }).others).toEqual([]);
    const result = build("chelsea", [person("chelsea"), person(me), person("melodi")], {
      households: [household("Richardson", ["chelsea", me, "melodi"])],
    });
    expect(result.householdMembers.map((r) => r.person.id)).toEqual(["melodi"]);
  });

  it("still shows Ian's people on Ian's own screen", () => {
    const result = build(me, [person(me), person("tony")], { relationships: [link("r", me, "tony", "Friend")] });
    expect(result.others.map((r) => r.person.id)).toEqual(["tony"]);
  });

  it("skips unknown people, duplicate pairs and self-links", () => {
    expect(build("mark", [person("mark")], { relationships: [link("r", "mark", "ghost", "Friend")] }).others).toEqual([]);
    const duplicates = build("mark", [person("mark"), person("tony")], {
      relationships: [link("r1", "mark", "tony", "Coworker"), link("r2", "mark", "tony", "Friend")],
    });
    expect(duplicates.others.map((r) => [r.person.id, r.connectionType])).toEqual([["tony", "Coworker"]]);
    expect(build("mark", [person("mark")], { relationships: [link("r", "mark", "mark", "Other")] }).others).toEqual([]);
  });
});

describe("groups", () => {
  it("returns only groups containing the person, by name", () => {
    const result = build("mark", [person("mark")], {
      groups: [group("younger", ["mark"]), group("harrison", ["mark", "tony"]), group("college", ["tony"])],
    });
    expect(result.groups.map((g) => g.id)).toEqual(["harrison", "younger"]);
  });
});

describe("emptiness", () => {
  it("is empty with nothing to show", () => {
    expect(isEmptyConnections(build("mark", [person("mark")]))).toBe(true);
  });

  it("isn't empty with only groups or only a household", () => {
    expect(isEmptyConnections(build("mark", [person("mark")], { groups: [group("harrison", ["mark"])] }))).toBe(false);
    expect(
      isEmptyConnections(build("mark", [person("mark"), person("kendra")], { households: [household("Swehla", ["mark", "kendra"])] })),
    ).toBe(false);
  });

  it("drops a one-person household rather than heading an empty list", () => {
    const result = build("mark", [person("mark")], { households: [household("Swehla", ["mark"])] });
    expect(result.household).toBeNull();
    expect(isEmptyConnections(result)).toBe(true);
  });
});
