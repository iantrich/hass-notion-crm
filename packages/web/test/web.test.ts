import { describe, expect, it } from "vitest";
import { ageOn, birthLine, formatLongDate, formatMonthDay, formatMonthDayYear, initials, plural, untilLabel } from "../src/format.js";
import { href, parseRoute, tabOf } from "../src/router.js";

describe("format", () => {
  it("formats calendar days without the browser's zone moving them", () => {
    // Under TZ=Pacific/Kiritimati (UTC+14) in CI, a local-midnight Date
    // would read as the day before.
    expect(formatMonthDay("2026-10-14")).toBe("Oct 14");
    expect(formatMonthDayYear("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatLongDate("2026-09-05")).toBe("September 5, 2026");
  });

  it("computes age as of today, the day before and of the birthday", () => {
    expect(ageOn("1987-10-07", "2026-10-06")).toBe(38);
    expect(ageOn("1987-10-07", "2026-10-07")).toBe(39);
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("shows the birth line like the iOS person screen", () => {
    expect(birthLine("1987-10-07", false, "2026-10-14")).toBe("Oct 7, 1987 - 39");
    expect(birthLine("0001-10-07", true, "2026-10-14")).toBe("Oct 7");
  });

  it("labels countdowns, initials and counts", () => {
    expect(untilLabel(0)).toBe("Today");
    expect(untilLabel(1)).toBe("In 1 day");
    expect(untilLabel(5)).toBe("In 5 days");
    expect(initials("  Mera  Jane Richardson ")).toBe("MJ");
    expect(plural(1, "member")).toBe("1 member");
    expect(plural(2, "person", "people")).toBe("2 people");
  });
});

describe("router", () => {
  it("round-trips every route through its href", () => {
    expect(parseRoute(href.home())).toEqual({ name: "home" });
    expect(parseRoute(href.reachOut())).toEqual({ name: "reachOut" });
    expect(parseRoute(href.person("a b/c"))).toEqual({ name: "person", id: "a b/c", sheet: null });
    expect(parseRoute(href.logInteraction("p1"))).toEqual({ name: "person", id: "p1", sheet: "log" });
    expect(parseRoute(href.editInteraction("i1"))).toEqual({ name: "interaction", id: "i1", sheet: "edit" });
    expect(parseRoute(href.household("h1"))).toEqual({ name: "household", id: "h1" });
  });

  it("falls back to Home for unknown or incomplete routes", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/nope")).toEqual({ name: "home" });
    expect(parseRoute("#/person")).toEqual({ name: "home" });
  });

  it("knows which screens are tab roots", () => {
    expect(tabOf(parseRoute(href.search()))).toBe("search");
    expect(tabOf(parseRoute(href.person("p")))).toBeNull();
  });
});
