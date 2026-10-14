import { describe, expect, it } from "vitest";
import { hashForTail, tailOf } from "../src/deepLink.js";

describe("deep links", () => {
  it("finds the route tail after /app/<slug>", () => {
    expect(tailOf("/app/33991357_thread/person/abc")).toBe("/person/abc");
    expect(tailOf("/app/33991357_thread/reach-out")).toBe("/reach-out");
    expect(tailOf("/app/33991357_thread")).toBe("");
    expect(tailOf("/app/33991357_thread/")).toBe("");
    expect(tailOf("/lovelace/0")).toBeNull();
  });

  it("maps known routes to Thread hashes, and nothing else", () => {
    expect(hashForTail("/person/abc")).toBe("#/person/abc");
    expect(hashForTail("/birthdays")).toBe("#/birthdays");
    expect(hashForTail("/settings")).toBe("#/settings");
    expect(hashForTail("")).toBeNull();
    expect(hashForTail("/nonsense")).toBeNull();
  });
});
