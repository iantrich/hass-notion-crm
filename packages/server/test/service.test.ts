import { describe, expect, it } from "vitest";
import { RelationTruncatedError } from "@thread/core";
import { NotionClient } from "../src/notion/client.js";
import { RateLimiter } from "../src/notion/rateLimiter.js";
import { LiveNotionService } from "../src/notion/service.js";
import { date, emptyQuery, fakeFetch, json, noSleep, page, relation, richText, title } from "./helpers.js";

const sources = { people: "ds-people", households: "ds-households", groups: "ds-groups", relationships: "ds-rel", interactions: "ds-int" };

// Routes each request by URL to a canned body.
function service(routes: Record<string, unknown>) {
  const fetch = fakeFetch((request) => {
    const key = Object.keys(routes).find((k) => request.url.includes(k));
    return json(key ? routes[key] : emptyQuery);
  });
  const client = new NotionClient({ token: "t", fetchImpl: fetch.impl, limiter: new RateLimiter(1000, Date.now, noSleep), sleep: noSleep });
  return { service: new LiveNotionService(client, sources, () => ({ timeZone: "America/Chicago" })), requests: fetch.requests };
}
const results = (...pages: unknown[]) => ({ results: pages, next_cursor: null, has_more: false });

describe("fetchSnapshot", () => {
  it("builds the snapshot and inverts membership from the People side", async () => {
    const { service: s } = service({
      "ds-people": results(page("p1", { Name: title("Ada"), Household: relation(["h1"]), Groups: relation(["g1"]) })),
      "ds-households": results(page("h1", { "Household Name": title("Ada's House") }, "https://notion.so/house")),
      "ds-groups": results(page("g1", { "Group Name": title("Book Club"), Description: richText("Monthly") }, "https://notion.so/book")),
    });
    const snapshot = await s.fetchSnapshot();
    expect(snapshot.people.map((p) => p.name)).toEqual(["Ada"]);
    expect(snapshot.households[0]).toMatchObject({ memberIds: ["p1"], notionPageUrl: "https://notion.so/house" });
    expect(snapshot.groups[0]).toMatchObject({ memberIds: ["p1"], description: "Monthly", notionPageUrl: "https://notion.so/book" });
  });

  it("skips unmappable rows without failing the sync", async () => {
    const { service: s } = service({
      "ds-people": results(page("p1", { Name: title("Ada") }), page("p2", { Name: title("") })),
    });
    expect((await s.fetchSnapshot()).people.map((p) => p.id)).toEqual(["p1"]);
  });

  // Unmappable is skipped, truncated is fatal: the invariant the membership
  // design exists to protect.
  it("fails the whole sync on a truncated person relation, even alongside skippable rows", async () => {
    const { service: s } = service({
      "ds-people": results(page("p0", { Name: title("") }), page("p1", { Name: title("Ada"), Household: relation(["h1"], true) })),
    });
    await expect(s.fetchSnapshot()).rejects.toMatchObject({ name: "RelationTruncatedError", pageId: "p1", property: "Household" });
  });

  it("fails the whole sync on a truncated interaction relation", async () => {
    const { service: s } = service({
      "ds-int": results(page("i1", { Summary: title("Coffee"), Date: date("2026-08-01"), Person: relation(["p1"], true) })),
    });
    await expect(s.fetchSnapshot()).rejects.toBeInstanceOf(RelationTruncatedError);
  });
});

describe("fetchPerson", () => {
  it("returns the person and only their interactions, by relation filter", async () => {
    const { service: s, requests } = service({
      "pages/p1": page("p1", { Name: title("Ada"), Occupation: richText("Engineer") }),
      "ds-int": results(page("i1", { Summary: title("Coffee"), Person: relation(["p1"]), Date: date("2026-08-01") })),
    });
    const result = await s.fetchPerson("p1");
    expect(result.person).toMatchObject({ id: "p1", name: "Ada", occupation: "Engineer" });
    expect(result.interactions.map((i) => [i.id, i.summary, i.date])).toEqual([["i1", "Coffee", "2026-08-01"]]);
    // Without the filter this would pull every interaction in the database.
    expect(requests.find((r) => r.url.includes("ds-int"))?.body).toMatchObject({
      filter: { property: "Person", relation: { contains: "p1" } },
    });
  });
});

describe("writes", () => {
  it("creates an interaction in the interactions data source and maps the result", async () => {
    const created = page("i9", { Summary: title("Lunch"), Person: relation(["p1"]), Date: date("2026-10-14") });
    const { service: s, requests } = service({ "/pages": created });
    const interaction = await s.createInteraction({ personId: "p1", type: "Catch-up", date: "2026-10-14", summary: "Lunch", notes: null });
    expect(interaction).toMatchObject({ id: "i9", summary: "Lunch", date: "2026-10-14" });
    expect(requests[0]?.body).toMatchObject({ parent: { data_source_id: "ds-int" } });
  });

  it("throws when Notion returns a page that can't be mapped", async () => {
    const { service: s } = service({ "/pages": page("x", { Name: title("") }) });
    await expect(s.setFavorite("x", true)).rejects.toMatchObject({ kind: "malformedResponse" });
  });
});
