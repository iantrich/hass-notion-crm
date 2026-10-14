import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NotionSnapshot } from "@thread/core";
import { log } from "./log.js";

// Caches the photos Notion serves as page icons, and serves them so the
// browser never contacts Notion's file host.
//
// Notion-hosted URLs are presigned and expire, so the URL is worthless as a
// cache key. But the path holds a per-file UUID that only changes when the
// photo is replaced, so the path is the key: "re-fetch when the photo
// changes", without re-fetching every sync. Photos are fetched the first time
// they're asked for, not during sync. Unlike the iOS app they aren't
// downscaled: that would need a native image library on the HA box, and the
// originals average under 200 KB.

const MAX_BYTES = 5 * 1024 * 1024;
// Bitmaps only. These responses come from Home Assistant's own origin, so an
// SVG (which can carry script) opened directly would run with access to the
// HA session.
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const KEY_PATTERN = /^[0-9a-f]{64}$/;

export function avatarKey(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  return createHash("sha256").update(path).digest("hex");
}

export interface Avatar {
  bytes: Buffer;
  contentType: string;
}

export class AvatarCache {
  // Current source URL for each key, from the latest snapshot.
  private sources = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<Avatar | null>>();

  constructor(
    private readonly directory: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  // Call with each new snapshot so the keys map to fresh presigned URLs.
  register(snapshot: NotionSnapshot): void {
    const sources = new Map<string, string>();
    for (const item of [...snapshot.people, ...snapshot.households, ...snapshot.groups]) {
      if (!item.photoUrl) continue;
      const key = avatarKey(item.photoUrl);
      if (key) sources.set(key, item.photoUrl);
    }
    this.sources = sources;
  }

  async get(key: string): Promise<Avatar | null> {
    if (!KEY_PATTERN.test(key)) return null;
    const cached = await this.readDisk(key);
    if (cached) return cached;
    const source = this.sources.get(key);
    if (!source) return null;

    // Coalesces duplicate requests: a list asks for many avatars at once.
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.download(key, source).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    return pending;
  }

  private async readDisk(key: string): Promise<Avatar | null> {
    try {
      const [bytes, contentType] = await Promise.all([
        readFile(join(this.directory, key)),
        readFile(join(this.directory, `${key}.type`), "utf8"),
      ]);
      return ALLOWED_TYPES.has(contentType) ? { bytes, contentType } : null;
    } catch {
      return null;
    }
  }

  private async download(key: string, url: string): Promise<Avatar | null> {
    try {
      const response = await this.fetchImpl(url);
      const contentType = (response.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!response.ok || !ALLOWED_TYPES.has(contentType)) {
        log.warn(`Avatar fetch for ${key.slice(0, 8)} returned ${response.status} ${contentType}`);
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_BYTES) {
        log.warn(`Avatar ${key.slice(0, 8)} is too large (${bytes.length} bytes)`);
        return null;
      }
      const avatar = { bytes, contentType };
      await this.writeDisk(key, avatar);
      return avatar;
    } catch (error) {
      // A failed photo is a missing avatar, never an error page.
      log.warn(`Avatar fetch for ${key.slice(0, 8)} failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async writeDisk(key: string, avatar: Avatar): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(join(this.directory, `${key}.type.tmp`), avatar.contentType);
      await writeFile(join(this.directory, `${key}.tmp`), avatar.bytes);
      await rename(join(this.directory, `${key}.type.tmp`), join(this.directory, `${key}.type`));
      await rename(join(this.directory, `${key}.tmp`), join(this.directory, key));
    } catch (error) {
      // A cache that can't write is slow, not broken.
      log.warn(`Could not cache avatar: ${(error as Error).message}`);
    }
  }
}

// An item as the browser sees it: the photo points at this server's avatar
// route (relative, because the app is served under the ingress path).
export function withPhotoRoute<T extends { photoUrl: string | null }>(item: T): T {
  const key = item.photoUrl ? avatarKey(item.photoUrl) : null;
  return { ...item, photoUrl: key ? `api/avatars/${key}` : null };
}

export function withAvatarRoutes(snapshot: NotionSnapshot): NotionSnapshot {
  return {
    ...snapshot,
    people: snapshot.people.map(withPhotoRoute),
    households: snapshot.households.map(withPhotoRoute),
    groups: snapshot.groups.map(withPhotoRoute),
  };
}
