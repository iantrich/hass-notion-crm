import { describe, expect, it } from "vitest";
import { CONNECTION_TYPES, inverseOf, toConnectionType, toInteractionType, type ConnectionType } from "../src/index.js";

describe("connection types", () => {
  // Checked against Notion's own "Connection Type (Reverse)" formula across
  // all 278 live rows, so these pairs are not guesses.
  it("inverts directional types to their counterpart", () => {
    const pairs: [ConnectionType, ConnectionType][] = [
      ["Parent", "Child"],
      ["Grandparent", "Grandchild"],
      ["Pibling", "Nibling"],
      ["Parent-in-law", "Child-in-law"],
      ["Mentor", "Mentee"],
      ["Employer", "Employee"],
    ];
    for (const [a, b] of pairs) {
      expect(inverseOf(a)).toBe(b);
      expect(inverseOf(b)).toBe(a);
    }
  });

  it("treats symmetric types as their own inverse", () => {
    const symmetric: ConnectionType[] = [
      "Spouse", "Ex-Spouse", "Sibling", "Friend", "College Friend", "Neighbor", "Coworker",
      "Former Coworker", "Extended Family", "In-Law", "Partner", "Sibling-in-law", "Other",
    ];
    for (const type of symmetric) expect(inverseOf(type)).toBe(type);
  });

  it("round-trips every type", () => {
    for (const type of CONNECTION_TYPES) expect(inverseOf(inverseOf(type))).toBe(type);
  });

  // The authoritative option list on Notion's "Connection Type" select, read
  // from the live schema. In the iOS app, options missing from the enum
  // silently became Other: 45 of 373 live rows were mislabelled that way.
  const notionSelectOptions = [
    "Spouse", "Ex-Spouse", "Partner", "Sibling", "Parent", "Child", "Grandparent", "Grandchild",
    "Pibling", "Nibling", "In-Law", "Sibling-in-law", "Parent-in-law", "Child-in-law", "Friend",
    "College Friend", "Neighbor", "Coworker", "Former Coworker", "Mentor", "Mentee", "Employer",
    "Employee", "Extended Family", "Other",
  ];

  it("has a type for every Notion option, and none Notion can't produce", () => {
    expect([...CONNECTION_TYPES].sort()).toEqual([...notionSelectOptions].sort());
  });

  it("decodes Partner as Partner and unknown values as Other", () => {
    expect(toConnectionType("Partner")).toBe("Partner");
    expect(toConnectionType("Nemesis")).toBe("Other");
    expect(toConnectionType(null)).toBe("Other");
  });

  it("decodes unknown interaction types as Other", () => {
    expect(toInteractionType("Catch-up")).toBe("Catch-up");
    expect(toInteractionType("Brand New Type")).toBe("Other");
  });
});
