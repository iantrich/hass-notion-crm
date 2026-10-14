import { describe, expect, it } from "vitest";
import {
  connectionTypeRelativeTo,
  decodePage,
  invertMembership,
  mapGroup,
  mapHousehold,
  mapInteraction,
  mapPerson,
  mapRelationship,
  PropertyName,
  relationOf,
  RelationTruncatedError,
} from "../src/index.js";

const ctx = { timeZone: "America/Chicago" };
const page = (json: string) => decodePage(JSON.parse(json));

// Structure mirrors a real API response; contact values are made up so no
// real personal data enters the repository.
const personJson = `
{"object":"page","id":"3baea881-adbc-8103-afcb-c022ffedd072",
 "url":"https://www.notion.so/Test-Person-3baea881adbc8103afcbc022ffedd072",
 "properties":{
   "Name":{"id":"title","type":"title","title":[{"plain_text":"Test Person"}]},
   "Phone":{"id":"a","type":"phone_number","phone_number":"5550001111"},
   "Phone 2":{"id":"b","type":"phone_number","phone_number":null},
   "Email":{"id":"c","type":"email","email":"test@example.com"},
   "Occupation":{"id":"d","type":"rich_text","rich_text":[{"plain_text":"Product Manager"}]},
   "Employer":{"id":"e","type":"rich_text","rich_text":[{"plain_text":"Example Co"}]},
   "How I Know Them":{"id":"f","type":"rich_text","rich_text":[{"plain_text":"Family"}]},
   "Birthday":{"id":"g","type":"date","date":{"start":"1987-10-07"}},
   "Birth Year Unknown":{"id":"h","type":"checkbox","checkbox":false},
   "Favorite":{"id":"i","type":"checkbox","checkbox":true},
   "Close Friend":{"id":"j","type":"checkbox","checkbox":false},
   "Hide From List":{"id":"k","type":"checkbox","checkbox":false},
   "Website":{"id":"l","type":"url","url":null},
   "LinkedIn":{"id":"m","type":"url","url":"https://www.linkedin.com/in/test"},
   "Facebook":{"id":"n","type":"url","url":"javascript:alert(1)"},
   "Instagram":{"id":"o","type":"url","url":null},
   "Relationship Summary":{"id":"p","type":"rich_text","rich_text":[]},
   "Summary Updated":{"id":"q","type":"date","date":null},
   "Address":{"id":"r","type":"place","place":null},
   "Household Address":{"id":"s","type":"rollup","rollup":{"type":"array","array":[{"type":"place","place":{"lat":41.27,"lon":-96.0,"name":"Home","address":"1511 Test St, Omaha, NE"}}],"function":"show_original"}},
   "Household":{"id":"t","type":"relation","relation":[{"id":"hh-1"}],"has_more":false},
   "Groups":{"id":"u","type":"relation","relation":[{"id":"g-1"}],"has_more":false}
 }}`;

describe("mapPerson", () => {
  it("maps the core fields", () => {
    const person = mapPerson(page(personJson), ctx);
    expect(person).toMatchObject({
      id: "3baea881-adbc-8103-afcb-c022ffedd072",
      name: "Test Person",
      phone: "5550001111",
      phone2: null,
      email: "test@example.com",
      occupation: "Product Manager",
      employer: "Example Co",
      howIKnowThem: "Family",
      isFavorite: true,
      isCloseFriend: false,
      hideFromList: false,
      linkedIn: "https://www.linkedin.com/in/test",
      website: null,
      relationshipSummary: null,
    });
    expect(person?.notionPageUrl).not.toBeNull();
  });

  it("keeps the birthday as the same calendar day", () => {
    expect(mapPerson(page(personJson), ctx)?.birthday).toBe("1987-10-07");
  });

  it("takes the household address from the rollup when the personal one is null", () => {
    const person = mapPerson(page(personJson), ctx);
    expect(person?.address).toBeNull();
    expect(person?.householdAddress?.address).toBe("1511 Test St, Omaha, NE");
  });

  it("drops links that aren't http(s)", () => {
    expect(mapPerson(page(personJson), ctx)?.facebook).toBeNull();
  });

  it("skips a page with no name", () => {
    // One live row genuinely has no Name.
    expect(
      mapPerson(page(`{"object":"page","id":"x","url":"https://n","properties":{"Name":{"id":"title","type":"title","title":[]}}}`), ctx),
    ).toBeNull();
  });

  it("throws on a truncated membership relation", () => {
    // Silent truncation is the failure this whole design exists to avoid.
    const truncated = page(
      `{"object":"page","id":"x","url":"https://n","properties":{"Name":{"id":"title","type":"title","title":[{"plain_text":"A"}]},"Groups":{"id":"u","type":"relation","relation":[{"id":"g"}],"has_more":true}}}`,
    );
    expect(() => mapPerson(truncated, ctx)).toThrow(RelationTruncatedError);
  });

  it("exposes the membership relations", () => {
    const p = page(personJson);
    expect(relationOf(p, PropertyName.household)).toEqual(["hh-1"]);
    expect(relationOf(p, PropertyName.groups)).toEqual(["g-1"]);
  });
});

function relationshipPage(a: string, b: string, type: string) {
  return page(`{"object":"page","id":"r-1","url":"https://n","properties":{
    "Name":{"id":"title","type":"title","title":[{"plain_text":"ignored"}]},
    "People":{"id":"a","type":"relation","relation":[{"id":"${a}"},{"id":"${b}"}],"has_more":false},
    "Connection Type":{"id":"b","type":"select","select":{"name":"${type}"}}}}`);
}

describe("mapRelationship", () => {
  it("preserves relation order", () => {
    const link = mapRelationship(relationshipPage("ian", "mera", "Parent"));
    expect(link?.personIds).toEqual(["ian", "mera"]);
    expect(link?.connectionType).toBe("Parent");
  });

  it("skips a row without exactly two people", () => {
    const one = page(`{"object":"page","id":"r-2","url":"https://n","properties":{
      "Name":{"id":"title","type":"title","title":[{"plain_text":"x"}]},
      "People":{"id":"a","type":"relation","relation":[{"id":"only"}],"has_more":false},
      "Connection Type":{"id":"b","type":"select","select":{"name":"Friend"}}}}`);
    expect(mapRelationship(one)).toBeNull();
  });

  // The label on a person's screen is their relation TO Ian.
  it("inverts when Ian is second", () => {
    // "[Melodi, Ian] / Parent": Ian is Melodi's parent, so Melodi is his Child.
    const link = mapRelationship(relationshipPage("melodi", "ian", "Parent"));
    expect(link && connectionTypeRelativeTo(link, "ian")).toBe("Child");
  });

  it("doesn't invert when Ian is first", () => {
    // "[Ian, Mera] / Parent": Mera is Ian's parent.
    const link = mapRelationship(relationshipPage("ian", "mera", "Parent"));
    expect(link && connectionTypeRelativeTo(link, "ian")).toBe("Parent");
  });

  it("leaves symmetric types alone in either slot", () => {
    const link = mapRelationship(relationshipPage("chelsea", "ian", "Spouse"));
    expect(link && connectionTypeRelativeTo(link, "ian")).toBe("Spouse");
    expect(link && connectionTypeRelativeTo(link, "chelsea")).toBe("Spouse");
  });

  it("decodes an unknown type as Other", () => {
    expect(mapRelationship(relationshipPage("a", "b", "Nemesis"))?.connectionType).toBe("Other");
  });
});

function interactionPage(props: string) {
  return page(`{"object":"page","id":"i-1","url":"https://n","properties":{${props}}}`);
}

describe("mapInteraction", () => {
  it("maps every field", () => {
    const interaction = mapInteraction(
      interactionPage(`
        "Summary":{"id":"title","type":"title","title":[{"plain_text":"Karate class"}]},
        "Person":{"id":"a","type":"relation","relation":[{"id":"p-1"}],"has_more":false},
        "Date":{"id":"b","type":"date","date":{"start":"2026-08-13"}},
        "Notes":{"id":"c","type":"rich_text","rich_text":[{"plain_text":"brown belt"}]},
        "Type":{"id":"d","type":"select","select":{"name":"Milestone"}}`),
      ctx,
    );
    expect(interaction).toEqual({
      id: "i-1",
      summary: "Karate class",
      personIds: ["p-1"],
      date: "2026-08-13",
      notes: "brown belt",
      type: "Milestone",
    });
  });

  // A shared dinner is one row linked to everyone who was there; relation
  // order decides which name leads.
  it("keeps every person, in relation order", () => {
    const interaction = mapInteraction(
      interactionPage(`
        "Summary":{"id":"title","type":"title","title":[{"plain_text":"Block party"}]},
        "Person":{"id":"a","type":"relation","relation":[{"id":"zeta"},{"id":"alpha"},{"id":"p-3"}],"has_more":false},
        "Date":{"id":"b","type":"date","date":{"start":"2026-08-13"}},
        "Type":{"id":"d","type":"select","select":{"name":"Catch-up"}}`),
      ctx,
    );
    expect(interaction?.personIds).toEqual(["zeta", "alpha", "p-3"]);
  });

  it("skips the blank row rather than throwing", () => {
    // An empty relation isn't truncation.
    const blank = interactionPage(`
      "Summary":{"id":"title","type":"title","title":[]},
      "Person":{"id":"a","type":"relation","relation":[],"has_more":false},
      "Date":{"id":"b","type":"date","date":null},
      "Type":{"id":"d","type":"select","select":null}`);
    expect(mapInteraction(blank, ctx)).toBeNull();
  });

  it("falls back to Other for an unknown type", () => {
    const interaction = mapInteraction(
      interactionPage(`
        "Summary":{"id":"title","type":"title","title":[{"plain_text":"X"}]},
        "Person":{"id":"a","type":"relation","relation":[{"id":"p-1"}],"has_more":false},
        "Date":{"id":"b","type":"date","date":{"start":"2026-01-01"}},
        "Type":{"id":"d","type":"select","select":{"name":"Brand New Type"}}`),
      ctx,
    );
    expect(interaction?.type).toBe("Other");
  });

  it("throws on a truncated Person relation", () => {
    const truncated = interactionPage(`
      "Summary":{"id":"title","type":"title","title":[{"plain_text":"X"}]},
      "Person":{"id":"a","type":"relation","relation":[{"id":"p-1"}],"has_more":true},
      "Date":{"id":"b","type":"date","date":{"start":"2026-01-01"}},
      "Type":{"id":"d","type":"select","select":{"name":"Other"}}`);
    expect(() => mapInteraction(truncated, ctx)).toThrow(RelationTruncatedError);
  });
});

function memberPage(id: string, relationName: string, targets: string[]) {
  const refs = targets.map((t) => `{"id":"${t}"}`).join(",");
  return page(`{"object":"page","id":"${id}","url":"https://n","properties":{
    "Name":{"id":"title","type":"title","title":[{"plain_text":"${id}"}]},
    "${relationName}":{"id":"a","type":"relation","relation":[${refs}],"has_more":false}}}`);
}

describe("invertMembership", () => {
  it("inverts people into group membership", () => {
    const people = [
      memberPage("p1", "Groups", ["g1", "g2"]),
      memberPage("p2", "Groups", ["g1"]),
      memberPage("p3", "Groups", []),
    ];
    const map = invertMembership(PropertyName.groups, people);
    expect(map.get("g1")).toEqual(["p1", "p2"]);
    expect(map.get("g2")).toEqual(["p1"]);
    expect(map.has("g3")).toBe(false);
  });

  it("keeps people order, so the cached snapshot doesn't churn", () => {
    const people = [memberPage("b", "Household", ["h1"]), memberPage("a", "Household", ["h1"])];
    expect(invertMembership(PropertyName.household, people).get("h1")).toEqual(["b", "a"]);
  });
});

describe("household and group pages", () => {
  const titled = (id: string, title: string, extra = "") =>
    page(`{"object":"page","id":"${id}","url":"https://www.notion.so/${id}","properties":{
      "Name":{"id":"title","type":"title","title":[${title ? `{"plain_text":"${title}"}` : ""}]}${extra}}}`);

  it("maps a household with its inverted members", () => {
    expect(mapHousehold(titled("h1", "Richardson"), ["a", "b"])).toMatchObject({
      id: "h1",
      name: "Richardson",
      memberIds: ["a", "b"],
    });
  });

  it("maps a group with its description", () => {
    const group = mapGroup(
      titled("g1", "College", `,"Description":{"id":"d","type":"rich_text","rich_text":[{"plain_text":"Drake friends"}]}`),
      [],
    );
    expect(group).toMatchObject({ name: "College", description: "Drake friends" });
  });

  it("skips untitled households and groups", () => {
    expect(mapHousehold(titled("h1", ""), [])).toBeNull();
    expect(mapGroup(titled("g1", ""), [])).toBeNull();
  });
});
