import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NotionSnapshot } from "@thread/core";
import { log } from "../log.js";

// The whole dataset as one JSON file in /data. At current volumes (~800 rows,
// well under a megabyte) a database would be premature.
export class SnapshotStore {
  private readonly file: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    this.file = join(directory, "snapshot.json");
  }

  async load(): Promise<NotionSnapshot | null> {
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch {
      return null;
    }
    try {
      const snapshot = JSON.parse(text) as NotionSnapshot;
      if (!Array.isArray(snapshot.people) || typeof snapshot.fetchedAt !== "string") {
        throw new Error("missing fields");
      }
      return snapshot;
    } catch (error) {
      // A corrupt cache is recoverable: the next sync replaces it.
      log.warn(`Discarding unreadable snapshot: ${(error as Error).message}`);
      return null;
    }
  }

  // Atomic (write a temp file, then rename over the old one) and serialized,
  // so a crash or two overlapping saves can never leave half a file.
  save(snapshot: NotionSnapshot): Promise<void> {
    const write = async () => {
      await mkdir(this.directory, { recursive: true });
      const temp = `${this.file}.tmp`;
      await writeFile(temp, JSON.stringify(snapshot));
      await rename(temp, this.file);
    };
    this.writing = this.writing.then(write, write);
    return this.writing;
  }
}
