import {
  favoriteProperties,
  interactionProperties,
  interactionUpdateProperties,
  invertMembership,
  mapGroup,
  mapHousehold,
  mapInteraction,
  mapPerson,
  mapRelationship,
  personProperties,
  PropertyName,
  RelationTruncatedError,
  type Interaction,
  type MapContext,
  type NewInteractionDraft,
  type NewPersonDraft,
  type NotionPage,
  type NotionSnapshot,
  type Person,
} from "@thread/core";
import { log } from "../log.js";
import type { DataSources } from "../options.js";
import type { NotionClient } from "./client.js";
import { NotionError } from "./errors.js";

// One person's own fields plus their interactions: everything the detail
// screen shows except connections, which come from the whole dataset and so
// only from a full sync.
export interface PersonRefresh {
  person: Person;
  interactions: Interaction[];
}

// What the app needs from Notion. The live implementation talks to the API;
// mock mode swaps in fake data so the app runs with no Notion at all.
export interface NotionService {
  fetchSnapshot(): Promise<NotionSnapshot>;
  fetchPerson(id: string): Promise<PersonRefresh>;
  createPerson(draft: NewPersonDraft): Promise<Person>;
  setFavorite(personId: string, isFavorite: boolean): Promise<Person>;
  createInteraction(draft: NewInteractionDraft): Promise<Interaction>;
  updateInteraction(interaction: Interaction): Promise<Interaction>;
  deleteInteraction(id: string): Promise<void>;
}

export const DATA_SOURCE_LABELS: Record<keyof DataSources, string> = {
  people: "People",
  households: "Households",
  groups: "Groups",
  relationships: "Relationships",
  interactions: "Interactions",
};

// The line the iOS app drew, kept: null from a mapper means the row can't
// form a model, so skip it (one bad row must never fail a sync); a truncated
// relation means Notion cut it at 25 entries, so fail the whole sync, because
// that is silent data loss. This is the only place that line is drawn.
function mapSkipping<T>(pages: NotionPage[], label: string, map: (page: NotionPage) => T | null): T[] {
  const results: T[] = [];
  for (const page of pages) {
    try {
      const mapped = map(page);
      if (mapped === null) log.warn(`Skipping unmappable ${label} ${page.id}`);
      else results.push(mapped);
    } catch (error) {
      if (error instanceof RelationTruncatedError) throw error;
      log.warn(`Skipping ${label} ${page.id}: ${(error as Error).message}`);
    }
  }
  return results;
}

function required<T>(value: T | null, what: string): T {
  if (value === null) throw NotionError.malformed(`${what} came back unmappable`);
  return value;
}

export class LiveNotionService implements NotionService {
  constructor(
    private readonly client: NotionClient,
    private readonly dataSources: DataSources,
    private readonly ctx: () => MapContext,
  ) {}

  async fetchSnapshot(): Promise<NotionSnapshot> {
    // Sequential: ~11 requests against a ~3 req/s budget take the same time
    // either way, and the shared limiter would serialize them regardless.
    const peoplePages = await this.client.queryAll(this.dataSources.people);
    const householdPages = await this.client.queryAll(this.dataSources.households);
    const groupPages = await this.client.queryAll(this.dataSources.groups);
    const relationshipPages = await this.client.queryAll(this.dataSources.relationships);
    const interactionPages = await this.client.queryAll(this.dataSources.interactions);
    const ctx = this.ctx();

    const people = mapSkipping(peoplePages, "person", (page) => mapPerson(page, ctx));
    const householdMembers = invertMembership(PropertyName.household, peoplePages);
    const groupMembers = invertMembership(PropertyName.groups, peoplePages);

    return {
      people,
      households: mapSkipping(householdPages, "household", (page) =>
        mapHousehold(page, householdMembers.get(page.id) ?? []),
      ),
      groups: mapSkipping(groupPages, "group", (page) => mapGroup(page, groupMembers.get(page.id) ?? [])),
      relationships: mapSkipping(relationshipPages, "relationship", mapRelationship),
      interactions: mapSkipping(interactionPages, "interaction", (page) => mapInteraction(page, ctx)),
      fetchedAt: new Date().toISOString(),
    };
  }

  // Two requests instead of eleven: the person's page, then only the
  // interactions that point at them.
  async fetchPerson(id: string): Promise<PersonRefresh> {
    const page = await this.client.fetchPage(id);
    const ctx = this.ctx();
    const person = required(mapPerson(page, ctx), "Refreshed person");
    const interactionPages = await this.client.queryAll(this.dataSources.interactions, {
      property: PropertyName.person,
      relation: { contains: id },
    });
    return { person, interactions: mapSkipping(interactionPages, "interaction", (p) => mapInteraction(p, ctx)) };
  }

  async createPerson(draft: NewPersonDraft): Promise<Person> {
    const page = await this.client.createPage(this.dataSources.people, personProperties(draft));
    return required(mapPerson(page, this.ctx()), "Created person");
  }

  async setFavorite(personId: string, isFavorite: boolean): Promise<Person> {
    const page = await this.client.updatePage(personId, favoriteProperties(isFavorite));
    return required(mapPerson(page, this.ctx()), "Updated person");
  }

  async createInteraction(draft: NewInteractionDraft): Promise<Interaction> {
    const page = await this.client.createPage(this.dataSources.interactions, interactionProperties(draft));
    return required(mapInteraction(page, this.ctx()), "Created interaction");
  }

  async updateInteraction(interaction: Interaction): Promise<Interaction> {
    const page = await this.client.updatePage(interaction.id, interactionUpdateProperties(interaction));
    return required(mapInteraction(page, this.ctx()), "Updated interaction");
  }

  async deleteInteraction(id: string): Promise<void> {
    await this.client.archivePage(id);
  }
}
