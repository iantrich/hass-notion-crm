import type { Person, RelationshipLink } from "../models.js";
import { connectionTypeRelativeTo } from "../models.js";
import { byName } from "../people/names.js";

// Someone surfaced because a person they're related to matched the query.
export interface ConnectedMatch {
  person: Person;
  reason: string;
}

export interface PeopleSearchResult {
  direct: Person[];
  connected: ConnectedMatch[];
}

export function searchPeople(
  query: string,
  people: Person[],
  relationships: RelationshipLink[],
): PeopleSearchResult {
  // Search deliberately ignores Hide From List: it's the one place you can
  // reach anyone, including people kept out of the browsing lists.
  const everyone = [...people].sort(byName);
  if (query === "") return { direct: everyone, connected: [] };

  const needle = query.toLocaleLowerCase();
  const direct = everyone.filter((p) => p.name.toLocaleLowerCase().includes(needle));
  const directById = new Map(direct.map((p) => [p.id, p]));
  const everyoneById = new Map<string, Person>();
  for (const person of everyone) if (!everyoneById.has(person.id)) everyoneById.set(person.id, person);

  const connected: ConnectedMatch[] = [];
  const seen = new Set(directById.keys());
  for (const link of relationships) {
    // Anchor on the end that matched, so the label reads from the other
    // person's side: "Spouse of Tom", not "Spouse of Jenn".
    const matchedId = link.personIds.find((id) => directById.has(id));
    if (matchedId === undefined) continue;
    const otherId = link.personIds.find((id) => id !== matchedId);
    if (otherId === undefined || seen.has(otherId)) continue;
    seen.add(otherId);
    const other = everyoneById.get(otherId);
    const matched = directById.get(matchedId);
    const type = connectionTypeRelativeTo(link, matchedId);
    if (!other || !matched || type === null) continue;
    connected.push({ person: other, reason: `${type} of ${matched.name}` });
  }

  return { direct, connected: connected.sort((a, b) => byName(a.person, b.person)) };
}
