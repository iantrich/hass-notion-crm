import { describe, expect, it } from "vitest";
import { NotionClient, NOTION_VERSION } from "../src/notion/client.js";
import { NotionError } from "../src/notion/errors.js";
import { RateLimiter } from "../src/notion/rateLimiter.js";
import { emptyQuery, fakeFetch, json, noSleep, page } from "./helpers.js";

function client(fetchImpl: typeof fetch, sleep: (ms: number) => Promise<void> = noSleep) {
  return new NotionClient({
    token: "test-token",
    fetchImpl,
    sleep,
    limiter: new RateLimiter(1000, Date.now, noSleep),
    labels: { "ds-people": "People" },
  });
}

async function rejection(promise: Promise<unknown>): Promise<NotionError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof NotionError) return error;
    throw error;
  }
  throw new Error("expected a NotionError");
}

describe("NotionClient", () => {
  it("sends auth and version headers to the data source query endpoint", async () => {
    const { impl, requests } = fakeFetch(() => json(emptyQuery));
    await client(impl).queryAll("ds-1");
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer test-token");
    expect(requests[0]?.headers.get("Notion-Version")).toBe(NOTION_VERSION);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url).toBe("https://api.notion.com/v1/data_sources/ds-1/query");
  });

  it("follows pagination with the cursor until exhausted", async () => {
    const { impl, requests } = fakeFetch((_, i) =>
      json(
        i === 0
          ? { results: [page("a", {})], next_cursor: "CURSOR", has_more: true }
          : { results: [page("b", {})], next_cursor: null, has_more: false },
      ),
    );
    const pages = await client(impl).queryAll("ds-1");
    expect(pages.map((p) => p.id)).toEqual(["a", "b"]);
    // Without these, a client that dropped the cursor would still pass.
    expect(requests[0]?.body).toEqual({ page_size: 100 });
    expect(requests[1]?.body).toEqual({ page_size: 100, start_cursor: "CURSOR" });
  });

  it("passes a filter through", async () => {
    const { impl, requests } = fakeFetch(() => json(emptyQuery));
    await client(impl).queryAll("ds-1", { property: "Person", relation: { contains: "p1" } });
    expect(requests[0]?.body).toEqual({ page_size: 100, filter: { property: "Person", relation: { contains: "p1" } } });
  });

  it("maps a 404 on a query to 'database not shared', naming it", async () => {
    const { impl } = fakeFetch(() => json({ code: "object_not_found" }, 404));
    const error = await rejection(client(impl).queryAll("ds-people"));
    expect(error.kind).toBe("databaseNotShared");
    expect(error.message).toContain("People database (ds-people)");
    expect(error.message.toLowerCase()).toContain("shared");
  });

  it("maps a 404 on a page to 'page not found'", async () => {
    const { impl } = fakeFetch(() => json({ code: "object_not_found" }, 404));
    const error = await rejection(client(impl).archivePage("p-missing"));
    expect(error.kind).toBe("pageNotFound");
    expect(error.message).toContain("p-missing");
  });

  it("maps a 401 to a message about the token", async () => {
    const { impl } = fakeFetch(() => json({}, 401));
    const error = await rejection(client(impl).queryAll("ds-1"));
    expect(error.kind).toBe("unauthorized");
    expect(error.message.toLowerCase()).toContain("token");
  });

  it("retries a 429 after Retry-After, then succeeds", async () => {
    const waits: number[] = [];
    const { impl, requests } = fakeFetch((_, i) => (i === 0 ? json({}, 429, { "Retry-After": "2" }) : json(emptyQuery)));
    await client(impl, async (ms) => void waits.push(ms)).queryAll("ds-1");
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([2000]);
  });

  it("gives up after repeated 429s with a distinct error", async () => {
    const { impl, requests } = fakeFetch(() => json({}, 429, { "Retry-After": "0" }));
    const error = await rejection(client(impl).queryAll("ds-1"));
    expect(error.kind).toBe("rateLimited");
    expect(requests).toHaveLength(4);
  });

  it("reports other statuses with the response detail", async () => {
    const { impl } = fakeFetch(() => new Response("boom", { status: 500 }));
    const error = await rejection(client(impl).queryAll("ds-1"));
    expect(error.kind).toBe("http");
    expect(error.message).toContain("500");
    expect(error.message).toContain("boom");
  });

  it("reports a network failure as transport", async () => {
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await rejection(client(impl).queryAll("ds-1"))).kind).toBe("transport");
  });

  it("archives with PATCH archived: true", async () => {
    const { impl, requests } = fakeFetch(() => json(page("p", {})));
    await client(impl).archivePage("p-1");
    expect(requests[0]?.method).toBe("PATCH");
    expect(requests[0]?.url).toBe("https://api.notion.com/v1/pages/p-1");
    expect(requests[0]?.body).toEqual({ archived: true });
  });

  it("creates pages under a data source parent", async () => {
    const { impl, requests } = fakeFetch(() => json(page("new", {})));
    await client(impl).createPage("ds-1", { Name: { title: [] } });
    expect(requests[0]?.body).toEqual({
      parent: { type: "data_source_id", data_source_id: "ds-1" },
      properties: { Name: { title: [] } },
    });
  });

  it("skips an undecodable row without failing the query", async () => {
    const { impl } = fakeFetch(() =>
      json({ results: [page("a", {}), { object: "page", properties: {} }], next_cursor: null, has_more: false }),
    );
    expect((await client(impl).queryAll("ds-1")).map((p) => p.id)).toEqual(["a"]);
  });

  it("throws malformedResponse for a wholly unparseable response", async () => {
    const { impl } = fakeFetch(() => json({ nonsense: true }));
    expect((await rejection(client(impl).queryAll("ds-1"))).kind).toBe("malformedResponse");
  });
});

describe("RateLimiter", () => {
  // The reentrancy regression the iOS limiter guards against: concurrent
  // callers must be spaced out, not all read the same slot and fire at once.
  it("spaces concurrent callers by the minimum interval", async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter(10, () => clock, async (ms) => void waits.push(ms));
    await Promise.all(Array.from({ length: 5 }, () => limiter.waitForTurn()));
    expect(waits).toEqual([100, 200, 300, 400]);
    clock = 1000;
    waits.length = 0;
    await limiter.waitForTurn();
    expect(waits).toEqual([]);
  });
});
