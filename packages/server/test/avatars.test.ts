import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makePerson, type NotionSnapshot } from "@thread/core";
import { AvatarCache, avatarKey, withAvatarRoutes } from "../src/avatars.js";
import { fakeFetch } from "./helpers.js";

const photo = "https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/file-uuid/image.png";
const snapshotWith = (url: string): NotionSnapshot => ({
  people: [makePerson("p1", "Ada", { photoUrl: url })],
  households: [],
  groups: [],
  relationships: [],
  interactions: [],
  fetchedAt: "t",
});
const image = (type = "image/png") => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": type } });

describe("avatar keys", () => {
  it("ignore the expiring signature but tell photos apart", () => {
    expect(avatarKey(`${photo}?X-Amz-Signature=a`)).toBe(avatarKey(`${photo}?X-Amz-Signature=b`));
    expect(avatarKey(photo)).not.toBe(avatarKey(photo.replace("file-uuid", "other-uuid")));
    expect(avatarKey("not a url")).toBeNull();
  });

  it("are what the browser sees instead of Notion's URL", () => {
    const view = withAvatarRoutes(snapshotWith(`${photo}?sig=1`));
    expect(view.people[0]?.photoUrl).toBe(`api/avatars/${avatarKey(photo)}`);
  });
});

describe("AvatarCache", () => {
  const cache = async (fetchImpl: typeof fetch) => {
    const c = new AvatarCache(await mkdtemp(join(tmpdir(), "thread-avatars-")), fetchImpl);
    c.register(snapshotWith(`${photo}?sig=1`));
    return c;
  };
  const key = avatarKey(photo) as string;

  it("downloads once, coalescing concurrent asks, then serves from disk", async () => {
    const { impl, requests } = fakeFetch(() => image());
    const c = await cache(impl);
    const [a, b] = await Promise.all([c.get(key), c.get(key)]);
    expect(a?.contentType).toBe("image/png");
    expect(b?.bytes).toEqual(a?.bytes);
    await c.get(key);
    expect(requests).toHaveLength(1);
  });

  it("serves from disk after a restart without refetching", async () => {
    const dir = await mkdtemp(join(tmpdir(), "thread-avatars-"));
    const first = new AvatarCache(dir, fakeFetch(() => image("image/jpeg")).impl);
    first.register(snapshotWith(photo));
    await first.get(key);
    const { impl, requests } = fakeFetch(() => image());
    const second = new AvatarCache(dir, impl);
    expect((await second.get(key))?.contentType).toBe("image/jpeg");
    expect(requests).toHaveLength(0);
  });

  it("yields nothing for failed, non-image or SVG responses", async () => {
    expect(await (await cache(fakeFetch(() => new Response("", { status: 403 })).impl)).get(key)).toBeNull();
    expect(await (await cache(fakeFetch(() => image("text/html")).impl)).get(key)).toBeNull();
    // SVG can carry script, and this route is on Home Assistant's origin.
    expect(await (await cache(fakeFetch(() => image("image/svg+xml")).impl)).get(key)).toBeNull();
    const throwing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await (await cache(throwing)).get(key)).toBeNull();
  });

  it("only fetches keys from the current snapshot", async () => {
    const { impl, requests } = fakeFetch(() => image());
    const c = await cache(impl);
    expect(await c.get("0".repeat(64))).toBeNull();
    expect(await c.get("../../etc/passwd")).toBeNull();
    expect(requests).toHaveLength(0);
  });
});
