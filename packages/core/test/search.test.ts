import { describe, expect, it } from "vitest";
import { makePerson, searchPeople, type ConnectionType, type Person, type RelationshipLink } from "../src/index.js";

const person = (id: string, name: string, hidden = false) => makePerson(id, name, { hideFromList: hidden });
const link = (a: string, b: string, type: ConnectionType): RelationshipLink => ({
  id: `${a}-${b}`,
  personIds: [a, b],
  connectionType: type,
  notes: null,
});
const cast = [person("tom", "Tom Barnicle"), person("jenn", "Jenn Barnicle"), person("kid", "Zoe Barnicle")];
const search = (query: string, relationships: RelationshipLink[] = [], people: Person[] = cast) =>
  searchPeople(query, people, relationships);

describe("ordering", () => {
  it("sorts results by name", () => {
    const result = search("", [], [person("zoe", "Zoe Adams"), person("adam", "Adam Baker"), person("mera", "Mera Richardson")]);
    expect(result.direct.map((p) => p.id)).toEqual(["adam", "mera", "zoe"]);
  });

  it("sorts connected matches by name", () => {
    const result = search("Tom", [link("tom", "zoe", "Friend"), link("tom", "adam", "Friend")], [
      person("tom", "Tom Barnicle"),
      person("zoe", "Zoe Adams"),
      person("adam", "Adam Baker"),
    ]);
    expect(result.connected.map((m) => m.person.id)).toEqual(["adam", "zoe"]);
  });
});

describe("direct matches", () => {
  it("matches by name, ignoring case", () => {
    expect(search("Tom").direct.map((p) => p.id)).toEqual(["tom"]);
    expect(search("tOm").direct.map((p) => p.id)).toEqual(["tom"]);
  });

  it("returns everyone and no connections for an empty query", () => {
    const result = search("", [link("tom", "jenn", "Spouse")]);
    expect(result.direct).toHaveLength(3);
    expect(result.connected).toEqual([]);
  });

  // Search is the one place Hide From List doesn't apply.
  it("still finds hidden people", () => {
    expect(search("Tom", [], [person("tom", "Tom Barnicle", true)]).direct.map((p) => p.id)).toEqual(["tom"]);
  });
});

describe("connected matches", () => {
  it("surfaces people related to a direct match", () => {
    // Searching "Tom" should surface his wife Jenn.
    expect(search("Tom", [link("tom", "jenn", "Spouse")]).connected.map((m) => m.person.id)).toEqual(["jenn"]);
  });

  it("explains the connection from the connected person's side", () => {
    expect(search("Tom", [link("tom", "jenn", "Spouse")]).connected[0]?.reason).toBe("Spouse of Tom Barnicle");
    // "kid is the child of tom", so on the kid's row they're Tom's Child.
    expect(search("Tom", [link("tom", "kid", "Child")]).connected[0]?.reason).toBe("Child of Tom Barnicle");
  });

  it("doesn't repeat direct matches as connected", () => {
    const result = search("Barnicle", [link("tom", "jenn", "Spouse")]);
    expect(result.direct).toHaveLength(3);
    expect(result.connected).toEqual([]);
  });

  it("lists someone related to two matches once", () => {
    const result = search("Barnicle", [link("tom", "out", "Friend"), link("jenn", "out", "Friend")], [
      person("tom", "Tom Barnicle"),
      person("jenn", "Jenn Barnicle"),
      person("out", "Outsider"),
    ]);
    expect(result.connected.map((m) => m.person.id)).toEqual(["out"]);
  });

  it("still surfaces hidden people as connections", () => {
    const result = search("Tom", [link("tom", "jenn", "Spouse")], [person("tom", "Tom Barnicle"), person("jenn", "Jenn Barnicle", true)]);
    expect(result.connected.map((m) => m.person.id)).toEqual(["jenn"]);
  });

  it("ignores unknown people and links that don't touch a match", () => {
    expect(search("Tom", [link("tom", "ghost", "Friend")], [person("tom", "Tom Barnicle")]).connected).toEqual([]);
    expect(search("Tom", [link("jenn", "kid", "Child")]).connected).toEqual([]);
  });

  it("returns nothing when nothing matches", () => {
    const result = search("Zzz", [link("tom", "jenn", "Spouse")]);
    expect(result.direct).toEqual([]);
    expect(result.connected).toEqual([]);
  });
});
