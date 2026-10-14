import type {
  Interaction,
  InteractionType,
  NewInteractionDraft,
  NewPersonDraft,
  NotionSnapshot,
  Person,
} from "@thread/core";

// The server's responses. URLs are relative: the app lives under Home
// Assistant's per-session ingress path.

export interface SyncStatus {
  isRefreshing: boolean;
  fetchedAt: string | null;
  lastError: string | null;
}

export interface SnapshotResponse {
  snapshot: NotionSnapshot | null;
  status: SyncStatus;
  mePersonId: string;
  today: string;
}

export interface SetupResponse {
  missingSettings: string[];
  notifyTargets: string[];
  mobileAppServices: string[];
  timeZone: string;
}

export interface NotificationStatus {
  targets: string[];
  timeZone: string;
  kinds: { kind: "birthday" | "overdue" | "journal"; hour: number; lastSent: string | null }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly userId: string | null = null,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: { Accept: "application/json" } };
  if (method !== "GET") {
    // The server refuses writes without both: its CSRF protection.
    init.headers = { ...init.headers, "Content-Type": "application/json", "X-Thread-Request": "1" };
    init.body = JSON.stringify(body ?? {});
  }
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, "offline", "Couldn't reach Thread. Check your connection to Home Assistant.");
  }
  if (response.status === 204) return undefined as T;
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof json.message === "string"
        ? json.message
        : Array.isArray(json.issues)
          ? json.issues.join("; ")
          : `Request failed (${response.status})`;
    throw new ApiError(
      response.status,
      typeof json.error === "string" ? json.error : "error",
      message,
      typeof json.userId === "string" ? json.userId : null,
    );
  }
  return json as T;
}

export const api = {
  snapshot: () => request<SnapshotResponse>("GET", "api/snapshot"),
  refresh: () => request<SnapshotResponse>("POST", "api/refresh"),
  refreshPerson: (id: string) => request<SnapshotResponse>("POST", `api/people/${encodeURIComponent(id)}/refresh`),
  setup: () => request<SetupResponse>("GET", "api/setup"),
  notifications: () => request<NotificationStatus>("GET", "api/notifications"),
  testNotification: () => request<{ sent: boolean; failures: string[] }>("POST", "api/notifications/test"),
  addPerson: (draft: NewPersonDraft) => request<Person>("POST", "api/people", draft),
  setFavorite: (id: string, isFavorite: boolean) =>
    request<Person>("PUT", `api/people/${encodeURIComponent(id)}/favorite`, { isFavorite }),
  addInteraction: (draft: NewInteractionDraft) => request<Interaction>("POST", "api/interactions", draft),
  updateInteraction: (
    id: string,
    patch: { type: InteractionType; date: string; summary: string; notes: string | null },
  ) => request<Interaction>("PATCH", `api/interactions/${encodeURIComponent(id)}`, patch),
  deleteInteraction: (id: string) => request<undefined>("DELETE", `api/interactions/${encodeURIComponent(id)}`),
};
