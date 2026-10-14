import type { Person, PlaceAddress } from "../models.js";

// Notion stores phone numbers as raw digit strings ("4027696086") with no
// country code and no formatting. Numbers that don't fit the expected shapes
// are rejected rather than mangled.
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function formatPhone(raw: string | null): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") || digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// These open with target="_blank": in the iOS Companion app that is the only
// way a tel:, sms: or mailto: link inside the ingress iframe reaches Phone,
// Messages or Mail (see docs/spike-results.md).
export function callUrl(raw: string | null): string | null {
  const number = normalizePhone(raw);
  return number ? `tel:${number}` : null;
}

export function messageUrl(raw: string | null): string | null {
  const number = normalizePhone(raw);
  return number ? `sms:${number}` : null;
}

export function emailUrl(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  // Not full validation, just enough that the address survives as a URL:
  // Mail silently refuses a mailto: containing spaces.
  if (trimmed === "" || /\s/.test(trimmed)) return null;
  return `mailto:${trimmed}`;
}

// The person's own address first, their household's as the fallback.
// Household coverage is much better (115 people against 31) and street-level.
export function mapDestination(person: Person): PlaceAddress | null {
  return person.address ?? person.householdAddress;
}

// Coordinates rather than a text search, so Maps can't land on the wrong
// "Chicago". An https URL works in desktop browsers too, and opens Apple
// Maps on iOS.
export function mapsUrl(person: Person): string | null {
  const place = mapDestination(person);
  if (!place) return null;
  return `https://maps.apple.com/?ll=${place.latitude},${place.longitude}&q=${encodeURIComponent(place.name)}`;
}
