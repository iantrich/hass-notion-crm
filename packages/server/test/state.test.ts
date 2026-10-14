import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makePerson, type Interaction, type NotionSnapshot } from "@thread/core";
import type { NotionService, PersonRefresh } from "../src/notion/service.js";
import { AppState, NotSyncedError } from "../src/state/appState.js";
import { SnapshotStore } from "../src/state/snapshotStore.js";

const tempDir = () => mkdtemp(join(tmpdir(), "thread-test-"));

const snapshot = (overrides: Partial<NotionSnapshot> = {}): NotionSnapshot => ({
  people: [makePerson("p1", "Ada")],
  households: [],
  groups: [],
  relationships: [],
  interactions: [],
  fetchedAt: "2026-10-14T00:00:00.000Z",
  ...overrides,
});

const interaction = (id: string, personIds: string[]): Interaction => ({
  id,
  summary: id,
  personIds,
  date: "2026-10-01",
  notes: null,
  type: "Catch-up",
});

// A NotionService whose answers each test controls.
class FakeService implements NotionService {
  next: () => Promise<NotionSnapshot> = async () => snapshot();
  person: (id: string) => Promise<PersonRefresh> = async () => {
    throw new Error("unset");
  };
  failWrites = false;
  calls = 0;
  fetchSnapshot() {
    this.calls++;
    return this.next();
  }
  fetchPerson(id: string) {
    return this.person(id);
  }
  private write<T>(value: T): Promise<T> {
    return this.failWrites ? Promise.reject(new Error("Notion said no")) : Promise.resolve(value);
  }
  createPerson(draft: { name: string }) {
    return this.write(makePerson("new", draft.name));
  }
  setFavorite(personId: string, isFavorite: boolean) {
    return this.write(makePerson(personId, "Ada", { isFavorite }));
  }
  createInteraction() {
    return this.write(interaction("i-new", ["p1"]));
  }
  updateInteraction(i: Interaction) {
    return this.write(i);
  }
  deleteInteraction() {
    return this.write(undefined);
  }
}

async function setup() {
  const dir = await tempDir();
  const service = new FakeService();
  const state = new AppState(service, new SnapshotStore(dir));
  return { dir, service, state };
}

describe("SnapshotStore", () => {
  it("loads nothing before a save, then round-trips the latest save", async () => {
    const store = new SnapshotStore(await tempDir());
    expect(await store.load()).toBeNull();
    await store.save(snapshot({ people: [makePerson("p1", "Ada")] }));
    await store.save(snapshot({ people: [makePerson("p1", "Grace")] }));
    expect((await store.load())?.people.map((p) => p.name)).toEqual(["Grace"]);
  });

  it("treats a corrupt file as no cache rather than crashing", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "snapshot.json"), "not json");
    expect(await new SnapshotStore(dir).load()).toBeNull();
  });

  it("never leaves half a file behind overlapping saves", async () => {
    const dir = await tempDir();
    const store = new SnapshotStore(dir);
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.save(snapshot({ fetchedAt: `t${i}` }))));
    expect(JSON.parse(await readFile(join(dir, "snapshot.json"), "utf8")).fetchedAt).toBe("t9");
  });
});

describe("AppState sync", () => {
  it("saves a successful sync and tells listeners", async () => {
    const { dir, state } = await setup();
    const seen: NotionSnapshot[] = [];
    state.onChange((s) => seen.push(s));
    await state.refresh();
    expect(state.current()?.people).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(await new SnapshotStore(dir).load()).not.toBeNull();
  });

  it("keeps good data and records the error when a sync fails", async () => {
    const { service, state } = await setup();
    await state.refresh();
    service.next = async () => {
      throw new Error("Couldn't reach Notion");
    };
    await state.refresh();
    expect(state.current()?.people).toHaveLength(1);
    expect(state.status()).toMatchObject({ isRefreshing: false, lastError: "Couldn't reach Notion" });
  });

  it("clears the previous error on success", async () => {
    const { service, state } = await setup();
    service.next = async () => {
      throw new Error("down");
    };
    await state.refresh();
    service.next = async () => snapshot();
    await state.refresh();
    expect(state.status().lastError).toBeNull();
  });

  it("shares one sync between concurrent callers", async () => {
    const { service, state } = await setup();
    await Promise.all([state.refresh(), state.refresh(), state.refresh()]);
    expect(service.calls).toBe(1);
    expect(state.status().isRefreshing).toBe(false);
  });

  it("starts from the cached snapshot", async () => {
    const { dir } = await setup();
    await new SnapshotStore(dir).save(snapshot({ fetchedAt: "cached" }));
    const state = new AppState(new FakeService(), new SnapshotStore(dir));
    await state.loadCached();
    expect(state.status().fetchedAt).toBe("cached");
  });
});

describe("AppState per-person refresh", () => {
  async function synced(interactions: Interaction[]) {
    const ctx = await setup();
    ctx.service.next = async () =>
      snapshot({ people: [makePerson("p1", "Ada"), makePerson("p2", "Bo")], interactions });
    await ctx.state.refresh();
    return ctx;
  }

  it("updates the person's fields and replaces only their interactions", async () => {
    const { service, state } = await synced([interaction("mine", ["p1"]), interaction("theirs", ["p2"])]);
    service.person = async () => ({ person: makePerson("p1", "Ada Lovelace"), interactions: [interaction("fresh", ["p1"])] });
    await state.refreshPerson("p1");
    expect(state.current()?.people.find((p) => p.id === "p1")?.name).toBe("Ada Lovelace");
    expect(state.current()?.interactions.map((i) => i.id).sort()).toEqual(["fresh", "theirs"]);
  });

  it("replaces a shared interaction without duplicating it", async () => {
    const { service, state } = await synced([interaction("shared", ["p1", "p2"])]);
    service.person = async () => ({ person: makePerson("p1", "Ada"), interactions: [interaction("shared", ["p1", "p2"])] });
    await state.refreshPerson("p1");
    expect(state.current()?.interactions.map((i) => i.id)).toEqual(["shared"]);
  });

  it("removes interactions deleted in Notion", async () => {
    const { service, state } = await synced([interaction("gone", ["p1"])]);
    service.person = async () => ({ person: makePerson("p1", "Ada"), interactions: [] });
    await state.refreshPerson("p1");
    expect(state.current()?.interactions).toEqual([]);
  });

  it("leaves cached data intact when it fails", async () => {
    const { service, state } = await synced([interaction("mine", ["p1"])]);
    service.person = async () => {
      throw new Error("down");
    };
    await expect(state.refreshPerson("p1")).rejects.toThrow("down");
    expect(state.current()?.interactions.map((i) => i.id)).toEqual(["mine"]);
  });
});

describe("AppState writes", () => {
  it("refuses writes before the first sync", async () => {
    const { state } = await setup();
    await expect(state.setFavorite("p1", true)).rejects.toBeInstanceOf(NotSyncedError);
  });

  it("applies a write only after Notion accepts it", async () => {
    const { service, state } = await setup();
    await state.refresh();
    service.failWrites = true;
    await expect(state.setFavorite("p1", true)).rejects.toThrow("Notion said no");
    expect(state.current()?.people[0]?.isFavorite).toBe(false);
    service.failWrites = false;
    await state.setFavorite("p1", true);
    expect(state.current()?.people[0]?.isFavorite).toBe(true);
  });

  it("adds, updates and deletes interactions, notifying each time", async () => {
    const { state } = await setup();
    await state.refresh();
    let changes = 0;
    state.onChange(() => changes++);
    const created = await state.addInteraction({ personId: "p1", type: "Catch-up", date: "2026-10-14", summary: "x", notes: null });
    await state.updateInteraction({ ...created, summary: "edited" });
    expect(state.current()?.interactions.map((i) => i.summary)).toEqual(["edited"]);
    await state.deleteInteraction(created.id);
    expect(state.current()?.interactions).toEqual([]);
    await state.addPerson({ name: "New", phone: null, email: null, howIKnowThem: null, birthday: null, birthYearUnknown: false });
    expect(state.current()?.people.map((p) => p.name)).toEqual(["Ada", "New"]);
    expect(changes).toBe(4);
  });
});
