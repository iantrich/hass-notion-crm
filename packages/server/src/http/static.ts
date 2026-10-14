import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

// Serves the built web app (packages/web/dist).

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

export interface StaticFile {
  body: Buffer;
  contentType: string;
  cacheControl: string;
}

export class StaticFiles {
  private readonly root: string;

  constructor(root: string) {
    this.root = normalize(root);
  }

  // A file under the root, or null. Paths that try to climb out of the root
  // never resolve.
  async file(path: string): Promise<StaticFile | null> {
    let relative: string;
    try {
      relative = decodeURIComponent(path).replace(/^\/+/, "");
    } catch {
      return null;
    }
    const full = normalize(join(this.root, relative));
    if (full !== this.root && !full.startsWith(this.root + sep)) return null;
    const contentType = TYPES[extname(full)];
    if (!contentType) return null;
    try {
      const body = await readFile(full);
      // Vite puts content hashes in asset names, so those never go stale.
      const cacheControl = relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
      return { body, contentType, cacheControl };
    } catch {
      return null;
    }
  }

  async index(): Promise<StaticFile | null> {
    return this.file("index.html");
  }
}
