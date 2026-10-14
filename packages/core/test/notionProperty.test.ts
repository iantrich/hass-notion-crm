import { describe, expect, it } from "vitest";
import { decodeProperty, notionDay } from "../src/index.js";

const decode = (json: string) => decodeProperty(JSON.parse(json)).value;

describe("Notion dates", () => {
  it("keeps a date-only value as the same calendar day", () => {
    // Parsing at UTC midnight would slide birthdays a day early everywhere
    // west of Greenwich, which is what the iOS app guarded against.
    expect(notionDay("1987-10-07", "America/Chicago")).toBe("1987-10-07");
  });

  it("turns a datetime into its day in the given zone", () => {
    expect(notionDay("2026-08-14T17:51:00.000Z", "UTC")).toBe("2026-08-14");
    expect(notionDay("2026-08-15T02:00:00.000Z", "America/Chicago")).toBe("2026-08-14");
  });

  it("returns null for missing or invalid values", () => {
    expect(notionDay(null, "UTC")).toBeNull();
    expect(notionDay("2026-13-01", "UTC")).toBeNull();
    expect(notionDay("not a date", "UTC")).toBeNull();
  });
});

describe("decodeProperty", () => {
  it("joins title runs", () => {
    const property = decodeProperty(
      JSON.parse(`{"id":"t","type":"title","title":[{"plain_text":"Kendra "},{"plain_text":"Frazier"}]}`),
    );
    expect(property).toEqual({ value: { kind: "text", value: "Kendra Frazier" }, isTitle: true });
  });

  it("turns empty rich text into null", () => {
    expect(decode(`{"id":"r","type":"rich_text","rich_text":[]}`)).toEqual({ kind: "text", value: null });
  });

  it("reads present and null selects", () => {
    expect(decode(`{"id":"s","type":"select","select":{"name":"Spouse"}}`)).toEqual({ kind: "select", value: "Spouse" });
    expect(decode(`{"id":"s","type":"select","select":null}`)).toEqual({ kind: "select", value: null });
  });

  it("reads checkboxes", () => {
    expect(decode(`{"id":"c","type":"checkbox","checkbox":true}`)).toEqual({ kind: "checkbox", value: true });
  });

  it("reads phone, email and url as text", () => {
    expect(decode(`{"id":"p","type":"phone_number","phone_number":"5550001111"}`)).toEqual({ kind: "text", value: "5550001111" });
    expect(decode(`{"id":"e","type":"email","email":"a@b.com"}`)).toEqual({ kind: "text", value: "a@b.com" });
    expect(decode(`{"id":"u","type":"url","url":"https://example.com"}`)).toEqual({ kind: "text", value: "https://example.com" });
  });

  it("carries has_more on relations", () => {
    expect(decode(`{"id":"rel","type":"relation","relation":[{"id":"a"},{"id":"b"}],"has_more":true}`)).toEqual({
      kind: "relation",
      ids: ["a", "b"],
      hasMore: true,
    });
  });

  it("reads places", () => {
    expect(
      decode(`{"id":"pl","type":"place","place":{"lat":41.6,"lon":-93.6,"name":"Drake","address":"Drake University, Des Moines, IA"}}`),
    ).toEqual({
      kind: "place",
      value: { name: "Drake", address: "Drake University, Des Moines, IA", latitude: 41.6, longitude: -93.6 },
    });
  });

  it("treats a null place as empty, not an error", () => {
    expect(decode(`{"id":"pl","type":"place","place":null}`)).toEqual({ kind: "place", value: null });
  });

  it("treats a place without coordinates as empty, not an error", () => {
    // Address is typed by hand in Notion, so this shape is reachable, and
    // throwing here used to fail the entire People query in the iOS app.
    expect(decode(`{"id":"pl","type":"place","place":{"name":"Somewhere","address":"123 Main St"}}`)).toEqual({
      kind: "place",
      value: null,
    });
  });

  it("resolves a date rollup", () => {
    expect(
      decode(`{"id":"ro","type":"rollup","rollup":{"type":"date","date":{"start":"2026-08-13"},"function":"latest_date"}}`),
    ).toEqual({ kind: "date", start: "2026-08-13" });
  });

  it("takes the first place from an array rollup", () => {
    expect(
      decode(
        `{"id":"ro","type":"rollup","rollup":{"type":"array","array":[{"type":"place","place":{"lat":41.27,"lon":-96.0,"name":"Home","address":"1511 Test St"}}],"function":"show_original"}}`,
      ),
    ).toEqual({ kind: "place", value: { name: "Home", address: "1511 Test St", latitude: 41.27, longitude: -96 } });
  });

  it("reads string and number formulas", () => {
    expect(decode(`{"id":"f","type":"formula","formula":{"type":"string","string":"38"}}`)).toEqual({ kind: "text", value: "38" });
    expect(decode(`{"id":"f","type":"formula","formula":{"type":"number","number":49}}`)).toEqual({ kind: "number", value: 49 });
  });

  it("reads boolean formulas from the boolean key, in both directions", () => {
    expect(decode(`{"id":"f","type":"formula","formula":{"type":"boolean","boolean":true}}`)).toEqual({ kind: "checkbox", value: true });
    expect(decode(`{"id":"f","type":"formula","formula":{"type":"boolean","boolean":false}}`)).toEqual({ kind: "checkbox", value: false });
  });

  it("doesn't throw on an unknown property type", () => {
    // A new Notion property type must never crash a sync.
    expect(decode(`{"id":"x","type":"button","button":{}}`)).toEqual({ kind: "unsupported" });
  });

  it("throws on a wrongly typed value, so the row can be skipped", () => {
    expect(() => decode(`{"id":"c","type":"checkbox","checkbox":"yes"}`)).toThrow();
  });
});
