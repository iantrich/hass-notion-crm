import { describe, expect, it } from "vitest";
import {
  favoriteProperties,
  interactionProperties,
  interactionUpdateProperties,
  personProperties,
} from "../src/index.js";

describe("person payload", () => {
  it("shapes the title and optional fields", () => {
    const payload = personProperties({
      name: "Ada Lovelace",
      phone: "4025551234",
      email: "ada@example.com",
      howIKnowThem: "Work",
      birthday: "1990-03-04",
      birthYearUnknown: false,
    });
    expect(payload).toEqual({
      Name: { title: [{ text: { content: "Ada Lovelace" } }] },
      Phone: { phone_number: "4025551234" },
      Email: { email: "ada@example.com" },
      "How I Know Them": { rich_text: [{ text: { content: "Work" } }] },
      Birthday: { date: { start: "1990-03-04" } },
      "Birth Year Unknown": { checkbox: false },
    });
  });

  it("omits empty optional fields entirely", () => {
    const payload = personProperties({
      name: "Solo",
      phone: null,
      email: "",
      howIKnowThem: null,
      birthday: null,
      birthYearUnknown: false,
    });
    expect(Object.keys(payload)).toEqual(["Name"]);
  });
});

describe("interaction payload", () => {
  it("uses a date-only date and the person relation", () => {
    const payload = interactionProperties({
      personId: "p-1",
      type: "Catch-up",
      date: "2026-05-01",
      summary: "Coffee",
      notes: "Talked about the move",
    });
    expect(payload).toEqual({
      Summary: { title: [{ text: { content: "Coffee" } }] },
      Person: { relation: [{ id: "p-1" }] },
      // Date-only: an interaction is a calendar day, never a timestamp.
      Date: { date: { start: "2026-05-01" } },
      Type: { select: { name: "Catch-up" } },
      Notes: { rich_text: [{ text: { content: "Talked about the move" } }] },
    });
  });

  it("is JSON-serializable", () => {
    const payload = interactionProperties({ personId: "p", type: "Trip", date: "2026-05-01", summary: "S", notes: null });
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(payload).not.toHaveProperty("Notes");
  });

  it("updates without touching who the interaction was with", () => {
    const payload = interactionUpdateProperties({
      id: "i",
      summary: "Dinner",
      personIds: ["a", "b"],
      date: "2026-05-02",
      notes: null,
      type: "Other",
    });
    expect(payload).not.toHaveProperty("Person");
    // A cleared note must be written as empty, or the old text survives.
    expect(payload.Notes).toEqual({ rich_text: [{ text: { content: "" } }] });
  });
});

describe("favorite payload", () => {
  // Deliberately narrow: a person update carrying other properties could
  // clobber fields this app never reads back.
  it("sets only the checkbox, in both directions", () => {
    expect(favoriteProperties(true)).toEqual({ Favorite: { checkbox: true } });
    expect(favoriteProperties(false)).toEqual({ Favorite: { checkbox: false } });
  });
});
