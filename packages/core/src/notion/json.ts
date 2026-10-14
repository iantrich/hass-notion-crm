import { MalformedNotionError } from "./errors.js";

// Narrowing helpers for Notion's JSON. Absent and null both mean "no value";
// a value of the wrong type is a malformed payload.

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(obj: JsonObject, key: string): string | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new MalformedNotionError(`${key} is not a string`);
  return value;
}

export function optionalNumber(obj: JsonObject, key: string): number | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number") throw new MalformedNotionError(`${key} is not a number`);
  return value;
}

export function optionalBoolean(obj: JsonObject, key: string): boolean | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new MalformedNotionError(`${key} is not a boolean`);
  return value;
}

export function optionalObject(obj: JsonObject, key: string): JsonObject | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (!isObject(value)) throw new MalformedNotionError(`${key} is not an object`);
  return value;
}

export function optionalArray(obj: JsonObject, key: string): unknown[] | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new MalformedNotionError(`${key} is not an array`);
  return value;
}
