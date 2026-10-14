import { describe, expect, it } from "vitest";
import { addDays, dayOf, daysBetween, inYear, isCalendarDay } from "../src/index.js";

describe("calendar days", () => {
  it("validates real days only", () => {
    expect(isCalendarDay("2026-08-21")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("2026-8-21")).toBe(false);
  });

  it("does day arithmetic across month, year and DST boundaries", () => {
    expect(addDays("2026-07-10", 43)).toBe("2026-08-22");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    // US DST ends 2026-11-01; a calendar day is still one day.
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(daysBetween("2026-08-22", "2026-07-10")).toBe(-43);
  });

  it("rolls Feb 29 to Mar 1 in a year without one", () => {
    expect(inYear("2000-02-29", 2026)).toBe("2026-03-01");
    expect(inYear("2000-02-29", 2028)).toBe("2028-02-29");
  });

  it("converts an instant to the day it falls on in a named zone", () => {
    // 03:00 UTC on Aug 22 is still the evening of Aug 21 in Omaha.
    const instant = new Date("2026-08-22T03:00:00Z");
    expect(dayOf(instant, "America/Chicago")).toBe("2026-08-21");
    expect(dayOf(instant, "UTC")).toBe("2026-08-22");
  });
});
