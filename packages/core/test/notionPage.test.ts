import { describe, expect, it } from "vitest";
import { decodePage, decodeQueryResponse, mapPerson } from "../src/index.js";

const ctx = { timeZone: "America/Chicago" };

// Notion delivers a person's photo as the page icon, outside `properties`.
function page(icon: string) {
  return decodePage(
    JSON.parse(`{"object":"page","id":"p1","url":"https://www.notion.so/p1",
      "properties":{"Name":{"id":"title","type":"title","title":[{"plain_text":"Test Person"}]}},
      ${icon}}`),
  );
}

describe("page icons", () => {
  it("reads a Notion-hosted file icon", () => {
    const url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/file-uuid/image.png?X-Amz-Signature=abc";
    expect(page(`"icon":{"type":"file","file":{"url":"${url}","expiry_time":"2026-08-20T02:09:24.259Z"}}`).photoUrl).toBe(url);
  });

  it("reads an externally linked icon", () => {
    expect(page(`"icon":{"type":"external","external":{"url":"https://example.com/face.jpg"}}`).photoUrl).toBe(
      "https://example.com/face.jpg",
    );
  });

  it("ignores emoji, null and absent icons", () => {
    expect(page(`"icon":{"type":"emoji","emoji":"🎉"}`).photoUrl).toBeNull();
    expect(page(`"icon":null`).photoUrl).toBeNull();
    expect(decodePage(JSON.parse(`{"object":"page","id":"p1","url":null,"properties":{}}`)).photoUrl).toBeNull();
  });

  it("costs the photo, never the row, for an unrecognised icon shape", () => {
    const decoded = page(`"icon":{"type":"file","file":{"url":42}}`);
    expect(decoded.photoUrl).toBeNull();
    expect(decoded.id).toBe("p1");
  });

  it("carries the photo onto the person", () => {
    const url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/file-uuid/image.png?sig=1";
    expect(mapPerson(page(`"icon":{"type":"file","file":{"url":"${url}"}}`), ctx)?.photoUrl).toBe(url);
  });
});

describe("query responses", () => {
  it("skips an undecodable row instead of failing the page", () => {
    const response = decodeQueryResponse({
      results: [
        { id: "good", properties: {} },
        { id: "bad", properties: { Favorite: { type: "checkbox", checkbox: "yes" } } },
        { properties: {} },
      ],
      next_cursor: "cursor-2",
      has_more: true,
    });
    expect(response.results.map((p) => p.id)).toEqual(["good"]);
    expect(response.skipped).toHaveLength(2);
    expect(response.nextCursor).toBe("cursor-2");
    expect(response.hasMore).toBe(true);
  });

  it("throws when the response as a whole is unusable", () => {
    expect(() => decodeQueryResponse({ object: "error" })).toThrow();
  });

  it("treats a missing has_more as the last page", () => {
    expect(decodeQueryResponse({ results: [] }).hasMore).toBe(false);
  });
});
