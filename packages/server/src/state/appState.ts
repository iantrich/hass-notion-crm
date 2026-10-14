import type {
  Interaction,
  NewInteractionDraft,
  NewPersonDraft,
  NotionSnapshot,
  Person,
} from "@thread/core";
import { log } from "../log.js";
import type { NotionService } from "../notion/service.js";
import type { SnapshotStore } from "./snapshotStore.js";

export interface SyncStatus {
  isRefreshing: boolean;
  // ISO instant of the data on hand, or null before the first sync.
  fetchedAt: string | null;
  // Why the last sync failed, or null after a success.
  lastError: string | null;
}

export class NotSyncedError extends Error {
  override name = "NotSyncedError";
  constructor() {
    super("Thread hasn't synced with Notion yet.");
  }
}

// The server-side counterpart of the iOS AppModel: holds the snapshot, syncs
// it, and applies writes. The rules carried over:
// - A failed sync never discards good data.
// - Writes go to Notion first and change the snapshot only on success.
// - After every change the snapshot is saved and listeners are told, which is
//   how notifications will re-evaluate.
export class AppState {
  private snapshot: NotionSnapshot | null = null;
  private inFlight: Promise<void> | null = null;
  private lastError: string | null = null;
  private readonly listeners = new Set<(snapshot: NotionSnapshot) => void>();

  constructor(
    private readonly service: NotionService,
    private readonly store: SnapshotStore,
  ) {}

  async loadCached(): Promise<void> {
    this.snapshot = await this.store.load();
  }

  current(): NotionSnapshot | null {
    return this.snapshot;
  }

  status(): SyncStatus {
    return {
      isRefreshing: this.inFlight !== null,
      fetchedAt: this.snapshot?.fetchedAt ?? null,
      lastError: this.lastError,
    };
  }

  onChange(listener: (snapshot: NotionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Concurrent callers (the timer, pull-to-refresh, a notification about to
  // fire) share one sync rather than racing.
  refresh(): Promise<void> {
    this.inFlight ??= this.runRefresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runRefresh(): Promise<void> {
    try {
      const snapshot = await this.service.fetchSnapshot();
      this.lastError = null;
      await this.commit(snapshot);
    } catch (error) {
      this.lastError = (error as Error).message;
      log.error(`Sync failed: ${this.lastError}`);
    }
  }

  // One person without a full sync: their fields and their interactions.
  // Connections are left alone, because household and group membership are
  // inverted from the whole People table. Throws, so the caller can surface
  // the failure; cached data is never cleared.
  async refreshPerson(id: string): Promise<void> {
    const refreshed = await this.service.fetchPerson(id);
    const snapshot = this.require();
    // Replace rather than merge: an interaction deleted in Notion has to
    // disappear here too, and only this person's rows are in scope.
    const interactions = snapshot.interactions.filter((i) => !i.personIds.includes(id));
    interactions.push(...refreshed.interactions);
    await this.commit({
      ...snapshot,
      people: replaceById(snapshot.people, refreshed.person),
      interactions,
    });
  }

  async addPerson(draft: NewPersonDraft): Promise<Person> {
    this.require();
    const person = await this.service.createPerson(draft);
    const snapshot = this.require();
    await this.commit({ ...snapshot, people: [...snapshot.people, person] });
    return person;
  }

  async setFavorite(personId: string, isFavorite: boolean): Promise<Person> {
    this.require();
    const person = await this.service.setFavorite(personId, isFavorite);
    const snapshot = this.require();
    await this.commit({ ...snapshot, people: replaceById(snapshot.people, person) });
    return person;
  }

  async addInteraction(draft: NewInteractionDraft): Promise<Interaction> {
    this.require();
    const interaction = await this.service.createInteraction(draft);
    const snapshot = this.require();
    await this.commit({ ...snapshot, interactions: [...snapshot.interactions, interaction] });
    return interaction;
  }

  async updateInteraction(interaction: Interaction): Promise<Interaction> {
    this.require();
    const updated = await this.service.updateInteraction(interaction);
    const snapshot = this.require();
    await this.commit({ ...snapshot, interactions: replaceById(snapshot.interactions, updated) });
    return updated;
  }

  async deleteInteraction(id: string): Promise<void> {
    this.require();
    await this.service.deleteInteraction(id);
    const snapshot = this.require();
    await this.commit({ ...snapshot, interactions: snapshot.interactions.filter((i) => i.id !== id) });
  }

  private require(): NotionSnapshot {
    if (!this.snapshot) throw new NotSyncedError();
    return this.snapshot;
  }

  private async commit(snapshot: NotionSnapshot): Promise<void> {
    this.snapshot = snapshot;
    try {
      await this.store.save(snapshot);
    } catch (error) {
      // A cache that can't write is slower to start, not broken.
      log.error(`Could not save snapshot: ${(error as Error).message}`);
    }
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        log.error(`Snapshot listener failed: ${(error as Error).message}`);
      }
    }
  }
}

// Replaces the item with the same id, or appends it when it's new.
function replaceById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  const copy = [...items];
  copy[index] = item;
  return copy;
}
