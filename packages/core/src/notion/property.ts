import type { PlaceAddress } from "../models.js";
import { MalformedNotionError } from "./errors.js";
import {
  isObject,
  optionalArray,
  optionalBoolean,
  optionalNumber,
  optionalObject,
  optionalString,
  type JsonObject,
} from "./json.js";

// A normalized view of a Notion property. Several Notion types collapse to
// the same kind on purpose: title, rich_text, url, email, phone_number and
// string formulas are all just text to Thread.
//
// Dates keep Notion's raw `start` string ("2026-08-13" or a datetime with an
// offset). Turning a datetime into a calendar day needs a time zone, so that
// happens in NotionPage.day(), never here.
export type NotionPropertyValue =
  | { kind: "text"; value: string | null }
  | { kind: "number"; value: number | null }
  | { kind: "select"; value: string | null }
  | { kind: "checkbox"; value: boolean }
  | { kind: "date"; start: string | null }
  | { kind: "relation"; ids: string[]; hasMore: boolean }
  | { kind: "place"; value: PlaceAddress | null }
  | { kind: "unsupported" };

export interface NotionProperty {
  value: NotionPropertyValue;
  isTitle: boolean;
}

function joinedText(obj: JsonObject, key: string): string | null {
  const runs = optionalArray(obj, key) ?? [];
  const text = runs
    .map((run) => {
      if (!isObject(run)) throw new MalformedNotionError(`${key} run is not an object`);
      return optionalString(run, "plain_text") ?? "";
    })
    .join("");
  return text === "" ? null : text;
}

// A place without coordinates yields null rather than a zeroed PlaceAddress:
// the only consumer is the Map action, and 0,0 in the Gulf of Guinea is worse
// than no address. Address is typed by hand in Notion, so coordinate-less
// places are real.
function place(raw: JsonObject | null): PlaceAddress | null {
  if (!raw) return null;
  const lat = optionalNumber(raw, "lat");
  const lon = optionalNumber(raw, "lon");
  if (lat === null || lon === null) return null;
  const name = optionalString(raw, "name");
  const address = optionalString(raw, "address");
  return {
    name: name ?? address ?? "",
    address: address ?? name ?? "",
    latitude: lat,
    longitude: lon,
  };
}

function dateStart(obj: JsonObject, key: string): string | null {
  const date = optionalObject(obj, key);
  return date ? optionalString(date, "start") : null;
}

// formula and rollup both wrap a second, self-describing payload. An
// unexpected inner shape is unsupported rather than an error, so a formula
// Thread doesn't read can never cost the row.
function nested(obj: JsonObject, key: string): NotionPropertyValue {
  const inner = obj[key];
  if (!isObject(inner) || typeof inner.type !== "string") return { kind: "unsupported" };

  switch (inner.type) {
    case "string": {
      const s = optionalString(inner, "string");
      return { kind: "text", value: s === "" ? null : s };
    }
    case "number":
      return { kind: "number", value: optionalNumber(inner, "number") };
    case "boolean":
      return { kind: "checkbox", value: optionalBoolean(inner, "boolean") ?? false };
    case "date":
      return { kind: "date", start: dateStart(inner, "date") };
    case "array": {
      // Only the Household Address rollup uses this, and only its first
      // place matters.
      const items = inner.array;
      if (!Array.isArray(items)) return { kind: "unsupported" };
      let decoded: NotionPropertyValue[];
      try {
        decoded = items.map((item) => decodeProperty(item).value);
      } catch {
        return { kind: "unsupported" };
      }
      for (const value of decoded) {
        if (value.kind === "place" && value.value) return value;
      }
      return { kind: "place", value: null };
    }
    default:
      return { kind: "unsupported" };
  }
}

export function decodeProperty(raw: unknown): NotionProperty {
  if (!isObject(raw) || typeof raw.type !== "string") {
    throw new MalformedNotionError("property has no type");
  }
  const type = raw.type;
  const isTitle = type === "title";

  const value = ((): NotionPropertyValue => {
    switch (type) {
      case "title":
        return { kind: "text", value: joinedText(raw, "title") };
      case "rich_text":
        return { kind: "text", value: joinedText(raw, "rich_text") };
      case "url":
      case "email":
      case "phone_number":
        return { kind: "text", value: optionalString(raw, type) };
      case "number":
        return { kind: "number", value: optionalNumber(raw, "number") };
      case "select": {
        const select = optionalObject(raw, "select");
        return { kind: "select", value: select ? optionalString(select, "name") : null };
      }
      case "checkbox":
        return { kind: "checkbox", value: optionalBoolean(raw, "checkbox") ?? false };
      case "date":
        return { kind: "date", start: dateStart(raw, "date") };
      case "relation": {
        const refs = optionalArray(raw, "relation") ?? [];
        const ids = refs.map((ref) => {
          if (!isObject(ref) || typeof ref.id !== "string") {
            throw new MalformedNotionError("relation entry has no id");
          }
          return ref.id;
        });
        return { kind: "relation", ids, hasMore: optionalBoolean(raw, "has_more") ?? false };
      }
      case "place":
        return { kind: "place", value: place(optionalObject(raw, "place")) };
      case "formula":
      case "rollup":
        return nested(raw, type);
      default:
        // A new Notion property type must never crash a sync.
        return { kind: "unsupported" };
    }
  })();

  return { value, isTitle };
}
