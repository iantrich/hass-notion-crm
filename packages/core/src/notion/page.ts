import { dayOf, isCalendarDay, type CalendarDay } from "../calendarDay.js";
import type { PlaceAddress } from "../models.js";
import { MalformedNotionError, RelationTruncatedError } from "./errors.js";
import { isObject, optionalString } from "./json.js";
import { decodeProperty, type NotionProperty } from "./property.js";

export interface NotionPage {
  id: string;
  url: string | null;
  properties: Record<string, NotionProperty>;
  // Notion stores a person's photo as the page icon rather than as a
  // property, so it arrives outside `properties` entirely.
  photoUrl: string | null;
}

// `file` is a Notion-hosted upload, `external` a linked image. Emoji icons
// carry neither and are correctly ignored. An unrecognised shape costs the
// photo, never the row.
function iconUrl(icon: unknown): string | null {
  if (!isObject(icon)) return null;
  for (const key of ["file", "external"]) {
    const ref = icon[key];
    if (isObject(ref) && typeof ref.url === "string") return ref.url;
  }
  return null;
}

export function decodePage(raw: unknown): NotionPage {
  if (!isObject(raw) || typeof raw.id !== "string") {
    throw new MalformedNotionError("page has no id");
  }
  if (!isObject(raw.properties)) {
    throw new MalformedNotionError(`page ${raw.id} has no properties`);
  }
  const properties: Record<string, NotionProperty> = {};
  for (const [name, property] of Object.entries(raw.properties)) {
    properties[name] = decodeProperty(property);
  }
  return {
    id: raw.id,
    url: optionalString(raw, "url"),
    properties,
    photoUrl: iconUrl(raw.icon),
  };
}

export interface NotionQueryResponse {
  results: NotionPage[];
  // One description per row that failed to decode.
  skipped: string[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Decodes `results` one row at a time, so a single undecodable row is dropped
// (and reported through `skipped`) instead of failing the whole 100-row page
// and with it the whole sync. A response that is unparseable as a whole
// still throws.
export function decodeQueryResponse(raw: unknown): NotionQueryResponse {
  if (!isObject(raw) || !Array.isArray(raw.results)) {
    throw new MalformedNotionError("query response has no results");
  }
  const results: NotionPage[] = [];
  const skipped: string[] = [];
  for (const row of raw.results) {
    try {
      results.push(decodePage(row));
    } catch (error) {
      skipped.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    results,
    skipped,
    nextCursor: optionalString(raw, "next_cursor"),
    hasMore: raw.has_more === true,
  };
}

// A Notion date `start` as a calendar day. Date-only values are already days.
// Datetimes are instants, so they become the day they fall on in `timeZone`.
export function notionDay(start: string | null, timeZone: string): CalendarDay | null {
  if (!start) return null;
  if (start.length === 10) return isCalendarDay(start) ? start : null;
  const instant = new Date(start);
  return Number.isNaN(instant.getTime()) ? null : dayOf(instant, timeZone);
}

// Finds the title property by TYPE rather than by name, because the databases
// each name it differently (Name / Group Name / Household Name / Summary).
export function titleOf(page: NotionPage): string | null {
  for (const property of Object.values(page.properties)) {
    if (property.isTitle && property.value.kind === "text") return property.value.value;
  }
  return null;
}

export function textOf(page: NotionPage, name: string): string | null {
  const value = page.properties[name]?.value;
  return value?.kind === "text" ? value.value : null;
}

export function selectOf(page: NotionPage, name: string): string | null {
  const value = page.properties[name]?.value;
  return value?.kind === "select" ? value.value : null;
}

export function checkboxOf(page: NotionPage, name: string): boolean {
  const value = page.properties[name]?.value;
  return value?.kind === "checkbox" ? value.value : false;
}

export function dayOfProperty(page: NotionPage, name: string, timeZone: string): CalendarDay | null {
  const value = page.properties[name]?.value;
  return value?.kind === "date" ? notionDay(value.start, timeZone) : null;
}

export function placeOf(page: NotionPage, name: string): PlaceAddress | null {
  const value = page.properties[name]?.value;
  return value?.kind === "place" ? value.value : null;
}

// Throws rather than silently returning a short list: a truncated relation is
// data loss, not an empty value.
export function relationOf(page: NotionPage, name: string): string[] {
  const value = page.properties[name]?.value;
  if (value?.kind !== "relation") return [];
  if (value.hasMore) throw new RelationTruncatedError(page.id, name);
  return value.ids;
}
