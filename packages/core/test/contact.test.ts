import { describe, expect, it } from "vitest";
import {
  addDays,
  callUrl,
  contactStatus,
  emailUrl,
  formatPhone,
  makePerson,
  mapDestination,
  mapsUrl,
  messageUrl,
  normalizePhone,
  type Interaction,
} from "../src/index.js";

const today = "2026-08-21";
const interaction = (daysAgo: number): Interaction => ({
  id: `i-${daysAgo}`,
  summary: "Test",
  personIds: ["p1"],
  date: addDays(today, -daysAgo),
  notes: null,
  type: "Catch-up",
});
const status = (daysAgo: number[], isCloseFriend: boolean) => contactStatus(daysAgo.map(interaction), isCloseFriend, today);

describe("contact status", () => {
  it("marks a close friend past the cadence overdue", () => {
    expect(status([50], true)).toEqual({ lastContacted: addDays(today, -50), daysSinceContact: 50, urgency: "overdue" });
  });

  it("marks a close friend in the due-soon window", () => {
    expect(status([38], true).urgency).toBe("dueSoon");
  });

  it("marks recent contact ok", () => {
    expect(status([10], true).urgency).toBe("ok");
  });

  it("marks a close friend with no interactions overdue", () => {
    expect(status([], true)).toEqual({ lastContacted: null, daysSinceContact: null, urgency: "overdue" });
  });

  it("never marks anyone else due or overdue", () => {
    expect(status([100], false).urgency).toBe("ok");
    expect(status([], false).urgency).toBe("ok");
  });

  it("uses the most recent interaction", () => {
    expect(status([50, 5], true)).toEqual({ lastContacted: addDays(today, -5), daysSinceContact: 5, urgency: "ok" });
  });

  // Cadence 42 days with a 7-day window: 35 < days <= 42 is due soon, > 42 overdue.
  it.each([
    [35, "ok"],
    [36, "dueSoon"],
    [42, "dueSoon"],
    [43, "overdue"],
  ])("day %i is %s", (days, urgency) => {
    expect(status([days], true).urgency).toBe(urgency);
  });
});

describe("phone numbers", () => {
  // Notion stores raw 10-digit strings with no country code or formatting.
  it("normalizes to E.164", () => {
    expect(normalizePhone("4027696086")).toBe("+14027696086");
    expect(normalizePhone("(402) 769-6086")).toBe("+14027696086");
    expect(normalizePhone("402.769.6086")).toBe("+14027696086");
    expect(normalizePhone("14027696086")).toBe("+14027696086");
    expect(normalizePhone("+442071838750")).toBe("+442071838750");
  });

  it("rejects unrecognizable input rather than mangling it", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });

  it("formats US style when possible, raw otherwise", () => {
    expect(formatPhone("4027696086")).toBe("(402) 769-6086");
    expect(formatPhone("+442071838750")).toBe("+442071838750");
  });
});

describe("contact URLs", () => {
  it("builds call and message URLs", () => {
    expect(callUrl("4027696086")).toBe("tel:+14027696086");
    expect(messageUrl("4027696086")).toBe("sms:+14027696086");
    expect(callUrl(null)).toBeNull();
    expect(callUrl("nope")).toBeNull();
  });

  it("builds a trimmed mailto, rejecting blank or spaced addresses", () => {
    expect(emailUrl("mark@example.com")).toBe("mailto:mark@example.com");
    expect(emailUrl("  mark@example.com ")).toBe("mailto:mark@example.com");
    expect(emailUrl(null)).toBeNull();
    expect(emailUrl("   ")).toBeNull();
    expect(emailUrl("not an address")).toBeNull();
  });

  const personal = { name: "Personal", address: "1 Main St", latitude: 1, longitude: 2 };
  const shared = { name: "Household", address: "2 Oak St", latitude: 3, longitude: 4 };

  it("prefers the personal address over the household's", () => {
    expect(mapDestination(makePerson("p", "A", { address: personal, householdAddress: shared }))?.name).toBe("Personal");
    expect(mapDestination(makePerson("p", "A", { householdAddress: shared }))?.name).toBe("Household");
    expect(mapDestination(makePerson("p", "A"))).toBeNull();
    expect(mapsUrl(makePerson("p", "A"))).toBeNull();
  });

  it("maps by coordinates, not a text search", () => {
    const home = { name: "Home & Away", address: "1511 Test St", latitude: 41.27375, longitude: -96.00197 };
    expect(mapsUrl(makePerson("p", "A", { address: home }))).toBe(
      "https://maps.apple.com/?ll=41.27375,-96.00197&q=Home%20%26%20Away",
    );
  });
});
