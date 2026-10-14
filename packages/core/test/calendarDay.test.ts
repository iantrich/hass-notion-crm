import { describe, expect, it } from "vitest";
import { addDays, dayOf, daysBetween, inYear, isCalendarDay, localTime } from "../src/index.js";

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

  it("always produces YYYY-MM-DD, whatever the runtime's locale data", () => {
    // Regression: en-CA formatting was assumed to give YYYY-MM-DD, but a
    // Node.js without full locale data falls back to en-US ("10/14/2026").
    const original = Intl.DateTimeFormat;
    const fallback = function (_locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
      return new original("en-US", options);
    } as unknown as typeof Intl.DateTimeFormat;
    Intl.DateTimeFormat = fallback;
    try {
      for (const zone of ["America/Chicago", "Asia/Kolkata", "Pacific/Kiritimati", "UTC"]) {
        expect(isCalendarDay(dayOf(new Date("2026-01-02T12:00:00Z"), zone))).toBe(true);
      }
    } finally {
      Intl.DateTimeFormat = original;
    }
  });
});

describe("localTime", () => {
  it("gives the day, hour and minute in a named zone", () => {
    // 15:30 UTC is 10:30 in Chicago (daylight time), 21:00 in Kolkata, and
    // already the next morning in Kiritimati.
    const instant = new Date("2026-08-21T15:30:00Z");
    expect(localTime(instant, "America/Chicago")).toEqual({ day: "2026-08-21", hour: 10, minute: 30 });
    expect(localTime(instant, "Asia/Kolkata")).toEqual({ day: "2026-08-21", hour: 21, minute: 0 });
    expect(localTime(instant, "Pacific/Kiritimati")).toEqual({ day: "2026-08-22", hour: 5, minute: 30 });
  });

  it("reports midnight as hour 0", () => {
    expect(localTime(new Date("2026-08-21T05:00:00Z"), "America/Chicago").hour).toBe(0);
  });
});
