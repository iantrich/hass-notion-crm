export type NotionErrorKind =
  | "unauthorized"
  | "databaseNotShared"
  | "pageNotFound"
  | "rateLimited"
  | "http"
  | "transport"
  | "malformedResponse";

// HTTP reality mapped onto messages that say what to do. Shown on the setup
// and status screens, so they name the fix rather than the status code.
export class NotionError extends Error {
  override name = "NotionError";

  constructor(
    readonly kind: NotionErrorKind,
    message: string,
  ) {
    super(message);
  }

  static unauthorized() {
    return new NotionError(
      "unauthorized",
      "Notion rejected the integration token. Check notion_token in Thread's configuration.",
    );
  }

  // The exact failure hit when the iOS app was first wired up: Notion answers
  // 404, not 403, for databases the integration can't see, and relations to
  // them silently read as empty. This message is the only signal.
  static databaseNotShared(dataSourceId: string, label: string | null) {
    const subject = label ? `The ${label} database (${dataSourceId})` : `Database ${dataSourceId}`;
    return new NotionError(
      "databaseNotShared",
      `${subject} isn't shared with the Thread integration. Open the Personal CRM page in Notion → ⋯ → Connections, and add the integration.`,
    );
  }

  static pageNotFound(id: string) {
    return new NotionError("pageNotFound", `Notion page ${id} was not found. It may have been deleted or moved to the trash.`);
  }

  static rateLimited() {
    return new NotionError("rateLimited", "Notion is rate limiting requests. Try again in a moment.");
  }

  static http(status: number, detail: string) {
    return new NotionError("http", `Notion returned HTTP ${status}: ${detail}`);
  }

  static transport(detail: string) {
    return new NotionError("transport", `Couldn't reach Notion: ${detail}`);
  }

  static malformed(detail: string) {
    return new NotionError("malformedResponse", `Unexpected response from Notion: ${detail}`);
  }
}
