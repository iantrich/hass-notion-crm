// Hash routes, so navigation never depends on the ingress path the app is
// served under, and the browser's back button works.

export type Tab = "home" | "search" | "reachOut" | "add";

export type Route =
  | { name: "home" }
  | { name: "search" }
  | { name: "reachOut" }
  | { name: "add" }
  | { name: "birthdays" }
  | { name: "interactions" }
  | { name: "settings" }
  | { name: "person"; id: string; sheet: "log" | null }
  | { name: "household"; id: string }
  | { name: "group"; id: string }
  | { name: "interaction"; id: string; sheet: "edit" | null };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [first, id, extra] = parts;
  switch (first) {
    case undefined:
      return { name: "home" };
    case "search":
      return { name: "search" };
    case "reach-out":
      return { name: "reachOut" };
    case "add":
      return { name: "add" };
    case "birthdays":
      return { name: "birthdays" };
    case "interactions":
      return { name: "interactions" };
    case "settings":
      return { name: "settings" };
    case "person":
      if (id) return { name: "person", id, sheet: extra === "log" ? "log" : null };
      break;
    case "household":
      if (id) return { name: "household", id };
      break;
    case "group":
      if (id) return { name: "group", id };
      break;
    case "interaction":
      if (id) return { name: "interaction", id, sheet: extra === "edit" ? "edit" : null };
      break;
  }
  return { name: "home" };
}

const enc = encodeURIComponent;

export const href = {
  home: () => "#/",
  search: () => "#/search",
  reachOut: () => "#/reach-out",
  add: () => "#/add",
  birthdays: () => "#/birthdays",
  interactions: () => "#/interactions",
  settings: () => "#/settings",
  person: (id: string) => `#/person/${enc(id)}`,
  logInteraction: (personId: string) => `#/person/${enc(personId)}/log`,
  household: (id: string) => `#/household/${enc(id)}`,
  group: (id: string) => `#/group/${enc(id)}`,
  interaction: (id: string) => `#/interaction/${enc(id)}`,
  editInteraction: (id: string) => `#/interaction/${enc(id)}/edit`,
};

// Tab roots show the tab bar highlight; other screens keep the last tab's.
export function tabOf(route: Route): Tab | null {
  switch (route.name) {
    case "home":
    case "search":
    case "reachOut":
    case "add":
      return route.name;
    default:
      return null;
  }
}

export function isTabRoot(route: Route): boolean {
  return tabOf(route) !== null;
}
