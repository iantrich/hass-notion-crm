import { randomUUID } from "node:crypto";
import {
  addDays,
  makePerson,
  type Household,
  type Interaction,
  type NewInteractionDraft,
  type NewPersonDraft,
  type NotionSnapshot,
  type Person,
  type RelationshipLink,
} from "@thread/core";
import type { NotionService, PersonRefresh } from "../notion/service.js";

// Made-up people for running the app with no Notion at all (THREAD_MOCK=1).
// Writes are kept in memory for the life of the process.
//
// Dates are relative to `today`, so Home always has an upcoming birthday, a
// recent interaction and an overdue close friend to show.
export class MockNotionService implements NotionService {
  private snapshot: NotionSnapshot;

  constructor(today: string) {
    this.snapshot = fakeSnapshot(today);
  }

  async fetchSnapshot(): Promise<NotionSnapshot> {
    return structuredClone({ ...this.snapshot, fetchedAt: new Date().toISOString() });
  }

  async fetchPerson(id: string): Promise<PersonRefresh> {
    const person = this.snapshot.people.find((p) => p.id === id);
    if (!person) throw new Error(`No mock person ${id}`);
    return structuredClone({
      person,
      interactions: this.snapshot.interactions.filter((i) => i.personIds.includes(id)),
    });
  }

  async createPerson(draft: NewPersonDraft): Promise<Person> {
    const person = makePerson(randomUUID(), draft.name, {
      phone: draft.phone,
      email: draft.email,
      howIKnowThem: draft.howIKnowThem,
      birthday: draft.birthday,
      birthYearUnknown: draft.birthYearUnknown,
    });
    this.snapshot.people.push(person);
    return structuredClone(person);
  }

  async setFavorite(personId: string, isFavorite: boolean): Promise<Person> {
    const person = this.snapshot.people.find((p) => p.id === personId);
    if (!person) throw new Error(`No mock person ${personId}`);
    person.isFavorite = isFavorite;
    return structuredClone(person);
  }

  async createInteraction(draft: NewInteractionDraft): Promise<Interaction> {
    const interaction: Interaction = {
      id: randomUUID(),
      summary: draft.summary,
      personIds: [draft.personId],
      date: draft.date,
      notes: draft.notes,
      type: draft.type,
    };
    this.snapshot.interactions.push(interaction);
    return structuredClone(interaction);
  }

  async updateInteraction(interaction: Interaction): Promise<Interaction> {
    const index = this.snapshot.interactions.findIndex((i) => i.id === interaction.id);
    if (index === -1) throw new Error(`No mock interaction ${interaction.id}`);
    this.snapshot.interactions[index] = structuredClone(interaction);
    return structuredClone(interaction);
  }

  async deleteInteraction(id: string): Promise<void> {
    this.snapshot.interactions = this.snapshot.interactions.filter((i) => i.id !== id);
  }
}

export const MOCK_ME_ID = "mock-me";

function fakeSnapshot(today: string): NotionSnapshot {
  // A birthday `days` from today, `age` years ago.
  const birthday = (days: number, age: number) => {
    const day = addDays(today, days);
    return `${String(Number(day.slice(0, 4)) - age).padStart(4, "0")}${day.slice(4)}`;
  };
  const home = { name: "Home", address: "100 Example St, Omaha, NE", latitude: 41.2565, longitude: -95.9345 };

  const people: Person[] = [
    makePerson(MOCK_ME_ID, "Sam Rivera", { birthday: birthday(120, 40) }),
    makePerson("mock-alex", "Alex Rivera", { birthday: birthday(3, 38), isFavorite: true, phone: "5555550101", householdAddress: home }),
    makePerson("mock-jamie", "Jamie Rivera", { birthday: birthday(40, 9), isFavorite: true, householdAddress: home }),
    makePerson("mock-casey", "Casey Rivera", { birthday: birthday(200, 6), isFavorite: true, householdAddress: home }),
    makePerson("mock-pat", "Pat Morgan", { birthday: birthday(0, 67), phone: "5555550102", email: "pat@example.com" }),
    makePerson("mock-lee", "Lee Morgan", { birthday: birthday(15, 69) }),
    makePerson("mock-drew", "Drew Chen", { isCloseFriend: true, phone: "5555550103", occupation: "Teacher" }),
    makePerson("mock-robin", "Robin Okafor", { isCloseFriend: true, email: "robin@example.com" }),
    makePerson("mock-taylor", "Taylor Brooks", { isCloseFriend: true, birthday: birthday(25, 0), birthYearUnknown: true }),
    makePerson("mock-morgan", "Morgan Patel", { occupation: "Nurse", employer: "Example Health" }),
    makePerson("mock-quinn", "Quinn Patel", { hideFromList: true, birthday: birthday(1, 4) }),
    makePerson("mock-avery", "Avery Kim", { website: "https://example.com", linkedIn: "https://www.linkedin.com/in/example" }),
  ];

  const households: Household[] = [
    { id: "mock-house-rivera", name: "Rivera", memberIds: [MOCK_ME_ID, "mock-alex", "mock-jamie", "mock-casey"], notionPageUrl: null, photoUrl: null },
    { id: "mock-house-morgan", name: "Pat & Lee Morgan", memberIds: ["mock-pat", "mock-lee"], notionPageUrl: null, photoUrl: null },
    { id: "mock-house-patel", name: "Patel", memberIds: ["mock-morgan", "mock-quinn"], notionPageUrl: null, photoUrl: null },
  ];

  const link = (a: string, b: string, type: RelationshipLink["connectionType"]): RelationshipLink => ({
    id: `mock-rel-${a}-${b}`,
    personIds: [a, b],
    connectionType: type,
    notes: null,
  });
  const relationships = [
    link(MOCK_ME_ID, "mock-alex", "Spouse"),
    link(MOCK_ME_ID, "mock-jamie", "Child"),
    link(MOCK_ME_ID, "mock-casey", "Child"),
    link("mock-alex", "mock-jamie", "Child"),
    link("mock-alex", "mock-casey", "Child"),
    link(MOCK_ME_ID, "mock-pat", "Parent"),
    link(MOCK_ME_ID, "mock-lee", "Parent"),
    link(MOCK_ME_ID, "mock-drew", "Friend"),
    link(MOCK_ME_ID, "mock-robin", "College Friend"),
    link(MOCK_ME_ID, "mock-taylor", "Friend"),
    link("mock-morgan", "mock-quinn", "Child"),
    link(MOCK_ME_ID, "mock-morgan", "Coworker"),
    link(MOCK_ME_ID, "mock-avery", "Neighbor"),
  ];

  const interaction = (id: string, personIds: string[], daysAgo: number, summary: string, type: Interaction["type"] = "Catch-up"): Interaction => ({
    id: `mock-int-${id}`,
    summary,
    personIds,
    date: addDays(today, -daysAgo),
    notes: null,
    type,
  });
  const interactions = [
    interaction("1", ["mock-drew"], 2, "Coffee downtown"),
    interaction("2", ["mock-robin", "mock-taylor"], 39, "Dinner at Robin's"),
    interaction("3", ["mock-pat", "mock-lee"], 6, "Sunday lunch"),
    interaction("4", ["mock-morgan"], 20, "Started a new job", "Milestone"),
    interaction("5", ["mock-avery"], 50, "Block party"),
  ];

  return {
    people,
    households,
    groups: [
      { id: "mock-group-book", name: "Book Club", description: "Monthly, first Thursday", memberIds: ["mock-drew", "mock-robin", "mock-avery"], notionPageUrl: null, photoUrl: null },
      { id: "mock-group-college", name: "College", description: null, memberIds: ["mock-robin", "mock-taylor"], notionPageUrl: null, photoUrl: null },
    ],
    relationships,
    interactions,
    fetchedAt: new Date().toISOString(),
  };
}
