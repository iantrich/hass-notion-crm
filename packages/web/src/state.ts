import {
  contactStatus,
  type ContactStatus,
  type Interaction,
  type InteractionType,
  type NewInteractionDraft,
  type NewPersonDraft,
  type NotionSnapshot,
  type Person,
} from "@thread/core";
import { api, ApiError, type SetupResponse, type SnapshotResponse } from "./api.js";
import { parseRoute, type Route, type Tab } from "./router.js";

// One state object, re-rendered as a whole on every change. lit-html only
// touches the DOM that actually changed, so this stays fast at ~430 people.

export type Phase =
  // Waiting for the first snapshot.
  | { kind: "loading" }
  | { kind: "ready" }
  // The HA user isn't on allowed_user_ids; shows them their id.
  | { kind: "notAllowed"; userId: string | null }
  // Couldn't load at all (and nothing cached to show).
  | { kind: "error"; message: string };

export interface LogForm {
  key: string;
  type: InteractionType;
  date: string;
  summary: string;
  notes: string;
}

export interface AddForm {
  name: string;
  phone: string;
  email: string;
  howIKnowThem: string;
  hasBirthday: boolean;
  birthday: string;
  birthYearUnknown: boolean;
}

export interface State {
  phase: Phase;
  data: SnapshotResponse | null;
  setup: SetupResponse | null;
  route: Route;
  lastTab: Tab;
  search: { text: string; chip: "people" | "households" | "groups" };
  logForm: LogForm | null;
  addForm: AddForm;
  // A choice of phone numbers for Call or Message, when someone has two.
  phonePicker: { personId: string; action: "call" | "message" } | null;
  confirmDelete: string | null;
  busy: boolean;
  refreshing: boolean;
  toast: string | null;
}

const emptyAddForm = (): AddForm => ({
  name: "",
  phone: "",
  email: "",
  howIKnowThem: "",
  hasBirthday: false,
  birthday: "",
  birthYearUnknown: false,
});

export const state: State = {
  phase: { kind: "loading" },
  data: null,
  setup: null,
  route: parseRoute(location.hash),
  lastTab: "home",
  search: { text: "", chip: "people" },
  logForm: null,
  addForm: emptyAddForm(),
  phonePicker: null,
  confirmDelete: null,
  busy: false,
  refreshing: false,
  toast: null,
};

let renderer: () => void = () => {};
let scheduled = false;

export function setRenderer(render: () => void) {
  renderer = render;
}

// Batches changes made in the same tick into one render.
export function update(mutate?: (s: State) => void) {
  mutate?.(state);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    renderer();
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string) {
  clearTimeout(toastTimer);
  update((s) => (s.toast = message));
  toastTimer = setTimeout(() => update((s) => (s.toast = null)), 3500);
}

// ---- Reading the data ----

export function snapshot(): NotionSnapshot {
  return (
    state.data?.snapshot ?? {
      people: [],
      households: [],
      groups: [],
      relationships: [],
      interactions: [],
      fetchedAt: "",
    }
  );
}

export function today(): string {
  return state.data?.today ?? new Date().toISOString().slice(0, 10);
}

export function personById(id: string): Person | undefined {
  return snapshot().people.find((p) => p.id === id);
}

export function interactionsFor(personId: string): Interaction[] {
  return snapshot()
    .interactions.filter((i) => i.personIds.includes(personId))
    .sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1));
}

export function statusFor(person: Person): ContactStatus {
  return contactStatus(interactionsFor(person.id), person.isCloseFriend, today());
}

// ---- Loading and syncing ----

function patchSnapshot(mutate: (snapshot: NotionSnapshot) => NotionSnapshot) {
  if (!state.data?.snapshot) return;
  state.data = { ...state.data, snapshot: mutate(state.data.snapshot) };
}

function replaceById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((x) => x.id === item.id);
  return index === -1 ? [...items, item] : items.map((x, i) => (i === index ? item : x));
}

function handleLoadError(error: unknown) {
  if (error instanceof ApiError && error.code === "not_allowed") {
    update((s) => (s.phase = { kind: "notAllowed", userId: error.userId }));
  } else if (!state.data) {
    update((s) => (s.phase = { kind: "error", message: (error as Error).message }));
  } else {
    toast((error as Error).message);
  }
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;

export async function load() {
  clearTimeout(pollTimer);
  try {
    const data = await api.snapshot();
    update((s) => {
      s.data = data;
      s.phase = { kind: "ready" };
    });
    // The first sync after install takes a few seconds; keep checking.
    if (!data.snapshot && data.status.isRefreshing) {
      pollTimer = setTimeout(() => void load(), 1500);
    } else if (!data.snapshot) {
      const setup = await api.setup();
      update((s) => (s.setup = setup));
    }
  } catch (error) {
    handleLoadError(error);
  }
}

// Pull-to-refresh. On a person's screen it refreshes only that person (two
// requests rather than eleven), as the iOS app does.
export async function refresh() {
  if (state.refreshing) return;
  update((s) => (s.refreshing = true));
  try {
    const route = state.route;
    const data = route.name === "person" ? await api.refreshPerson(route.id) : await api.refresh();
    update((s) => (s.data = data));
    if (data.status.lastError) toast(data.status.lastError);
  } catch (error) {
    handleLoadError(error);
  } finally {
    update((s) => (s.refreshing = false));
  }
}

// ---- Writes ----

async function write<T>(run: () => Promise<T>): Promise<T | null> {
  if (state.busy) return null;
  update((s) => (s.busy = true));
  try {
    return await run();
  } catch (error) {
    toast((error as Error).message);
    return null;
  } finally {
    update((s) => (s.busy = false));
  }
}

// Optimistic, like the iOS star: flips immediately, rolls back on failure.
export async function toggleFavorite(person: Person) {
  const next = !person.isFavorite;
  update(() => patchSnapshot((s) => ({ ...s, people: replaceById(s.people, { ...person, isFavorite: next }) })));
  try {
    const saved = await api.setFavorite(person.id, next);
    update(() => patchSnapshot((s) => ({ ...s, people: replaceById(s.people, saved) })));
  } catch (error) {
    update(() => patchSnapshot((s) => ({ ...s, people: replaceById(s.people, person) })));
    toast(`Couldn't update favorite: ${(error as Error).message}`);
  }
}

export async function addInteraction(draft: NewInteractionDraft): Promise<boolean> {
  const created = await write(() => api.addInteraction(draft));
  if (!created) return false;
  update(() => patchSnapshot((s) => ({ ...s, interactions: [...s.interactions, created] })));
  return true;
}

export async function updateInteraction(
  id: string,
  patch: { type: InteractionType; date: string; summary: string; notes: string | null },
): Promise<boolean> {
  const updated = await write(() => api.updateInteraction(id, patch));
  if (!updated) return false;
  update(() => patchSnapshot((s) => ({ ...s, interactions: replaceById(s.interactions, updated) })));
  return true;
}

export async function deleteInteraction(id: string): Promise<boolean> {
  const done = await write(async () => {
    await api.deleteInteraction(id);
    return true;
  });
  if (!done) return false;
  update(() => patchSnapshot((s) => ({ ...s, interactions: s.interactions.filter((i) => i.id !== id) })));
  return true;
}

export async function addPerson(draft: NewPersonDraft): Promise<Person | null> {
  const person = await write(() => api.addPerson(draft));
  if (!person) return null;
  update((s) => {
    patchSnapshot((snap) => ({ ...snap, people: [...snap.people, person] }));
    s.addForm = emptyAddForm();
  });
  return person;
}

// ---- Navigation ----

// Hash changes this session. Back goes through history when there is any,
// otherwise (a deep link opened directly) to the screen's natural parent.
let navigations = 0;
export function noteNavigation() {
  navigations++;
}

export function goBack(fallback: string) {
  if (navigations > 0) history.back();
  else location.replace(fallback);
}
