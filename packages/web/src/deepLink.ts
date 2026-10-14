import { parseRoute } from "./router.js";

// Deep links from notifications and home-screen shortcuts.
//
// A notification opens /app/<slug>/<route> in Home Assistant, for example
// /app/33991357_thread/person/<id>. HA's app panel loads Thread's iframe at
// its ingress root whatever the tail, so Thread picks the tail up itself:
//
// 1. On load, from HA's own address. Thread's iframe is served from the same
//    origin as Home Assistant, so it can read window.top.location.
// 2. While open, from HA's "home-assistant/properties" message, which the
//    panel sends to a subscribed iframe whenever its route changes (so a
//    notification tapped with Thread already on screen still navigates).
//
// Once applied, Thread asks HA to drop the tail again, so reloading the panel
// doesn't jump back to the same screen.

// The route tail after /app/<slug> in a Home Assistant path, or null.
export function tailOf(pathname: string): string | null {
  const match = /^\/app\/[^/]+(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const tail = match[1] ?? "";
  return tail === "/" ? "" : tail;
}

// The Thread hash for a tail, or null when it names nothing Thread knows.
export function hashForTail(tail: string): string | null {
  if (tail === "") return null;
  const hash = `#${tail}`;
  const route = parseRoute(hash);
  // parseRoute falls back to Home for anything unknown; only follow real routes.
  if (route.name === "home") return null;
  return hash;
}

export interface DeepLinkHost {
  top: Window | null;
  parent: Window | null;
  self: Window;
  navigate: (hash: string) => void;
}

export function startDeepLinks(host: DeepLinkHost) {
  const { top, parent, self } = host;
  // Outside Home Assistant (local development) there's no panel to talk to.
  if (!parent || parent === self) return;

  let lastTail: string | null = null;
  let panelPrefix: string | null = null;

  const apply = (tail: string | null) => {
    if (tail === null || tail === lastTail) return;
    lastTail = tail;
    const hash = hashForTail(tail);
    if (!hash) return;
    host.navigate(hash);
    // Strip the tail from HA's address so a reload starts at Home.
    if (panelPrefix) {
      parent.postMessage({ type: "home-assistant/navigate", path: panelPrefix, options: { replace: true } }, self.location.origin);
    }
  };

  try {
    const pathname = top?.location.pathname ?? "";
    const match = /^\/app\/[^/]+/.exec(pathname);
    if (match) panelPrefix = match[0];
    apply(tailOf(pathname));
  } catch {
    // A cross-origin parent (not Home Assistant) can't be read; ignore.
  }

  self.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== parent || event.origin !== self.location.origin) return;
    const data = event.data as { type?: string; route?: { prefix?: string; path?: string } } | null;
    if (data?.type !== "home-assistant/properties" || !data.route) return;
    if (typeof data.route.prefix === "string" && data.route.prefix.startsWith("/app/")) {
      panelPrefix = data.route.prefix;
    }
    if (typeof data.route.path === "string") apply(data.route.path === "/" ? "" : data.route.path);
  });
  parent.postMessage({ type: "home-assistant/subscribe-properties" }, self.location.origin);
}
