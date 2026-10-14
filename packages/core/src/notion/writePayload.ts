import type { CalendarDay } from "../calendarDay.js";
import type { Interaction, NewInteractionDraft, NewPersonDraft } from "../models.js";
import { PropertyName } from "./propertyNames.js";

// Pure builders for Notion request bodies (the `properties` object), kept
// apart from the HTTP client so their shape is testable without a network.

type Properties = Record<string, unknown>;

function title(text: string) {
  return { title: [{ text: { content: text } }] };
}

function richText(text: string) {
  return { rich_text: [{ text: { content: text } }] };
}

// Date-only: an interaction or birthday is a calendar day, never a timestamp.
function day(value: CalendarDay) {
  return { date: { start: value } };
}

function present(value: string | null): value is string {
  return value !== null && value !== "";
}

export function personProperties(draft: NewPersonDraft): Properties {
  const properties: Properties = { [PropertyName.name]: title(draft.name) };
  if (present(draft.phone)) properties[PropertyName.phone] = { phone_number: draft.phone };
  if (present(draft.email)) properties[PropertyName.email] = { email: draft.email };
  if (present(draft.howIKnowThem)) properties[PropertyName.howIKnowThem] = richText(draft.howIKnowThem);
  if (draft.birthday) {
    properties[PropertyName.birthday] = day(draft.birthday);
    properties[PropertyName.birthYearUnknown] = { checkbox: draft.birthYearUnknown };
  }
  return properties;
}

// Only the checkbox. A broader person update would risk overwriting
// properties this app doesn't round-trip (Address is a Place, and the Google
// Contacts sync fields must never be hand-edited).
export function favoriteProperties(isFavorite: boolean): Properties {
  return { [PropertyName.favorite]: { checkbox: isFavorite } };
}

export function interactionProperties(draft: NewInteractionDraft): Properties {
  const properties: Properties = {
    [PropertyName.summary]: title(draft.summary),
    [PropertyName.person]: { relation: [{ id: draft.personId }] },
    [PropertyName.date]: day(draft.date),
    [PropertyName.type]: { select: { name: draft.type } },
  };
  if (present(draft.notes)) properties[PropertyName.notes] = richText(draft.notes);
  return properties;
}

// Leaves the Person relation alone: editing an interaction never changes who
// it was with.
export function interactionUpdateProperties(interaction: Interaction): Properties {
  return {
    [PropertyName.summary]: title(interaction.summary),
    [PropertyName.date]: day(interaction.date),
    [PropertyName.type]: { select: { name: interaction.type } },
    [PropertyName.notes]: richText(interaction.notes ?? ""),
  };
}
