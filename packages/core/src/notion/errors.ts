// The response (or one row of it) isn't shaped the way Notion documents it.
// One malformed row is skipped; a malformed response fails the request.
export class MalformedNotionError extends Error {
  override name = "MalformedNotionError";
}

// Distinct from MalformedNotionError because the sync has to tell them apart:
// an unmappable row is skipped, but a truncated relation fails the whole sync,
// since Notion caps relation arrays at 25 and silently dropping members is
// exactly the failure the membership design exists to prevent.
export class RelationTruncatedError extends Error {
  override name = "RelationTruncatedError";

  constructor(
    readonly pageId: string,
    readonly property: string,
  ) {
    super(
      `The '${property}' relation on page ${pageId} is truncated at 25 entries, so syncing ` +
        "it would silently drop members. Read this relation from the other side instead.",
    );
  }
}
