import { html, nothing, render, type TemplateResult } from "lit";
import { topBarAction } from "./components.js";
import { ago } from "./format.js";
import { icons } from "./icons.js";
import { href, parseRoute, tabOf, type Route, type Tab } from "./router.js";
import { goBack, load, noteNavigation, refresh, state, setRenderer, update } from "./state.js";
import { addView } from "./views/add.js";
import { birthdaysView, homeView, interactionsView } from "./views/home.js";
import { interactionView } from "./views/interaction.js";
import { CLAUDE_URL } from "./views/log.js";
import { groupView, householdView } from "./views/members.js";
import { personView } from "./views/person.js";
import { reachOutView } from "./views/reachOut.js";
import { searchView } from "./views/search.js";
import { errorScreen, loadingScreen, notAllowedScreen, setupScreen } from "./views/status.js";
import type { View } from "./views/view.js";

function viewFor(route: Route): View {
  switch (route.name) {
    case "home":
      return homeView();
    case "search":
      return searchView();
    case "reachOut":
      return reachOutView();
    case "add":
      return addView();
    case "birthdays":
      return birthdaysView();
    case "interactions":
      return interactionsView();
    case "person":
      return personView(route.id, route.sheet);
    case "household":
      return householdView(route.id);
    case "group":
      return groupView(route.id);
    case "interaction":
      return interactionView(route.id, route.sheet);
  }
}

const TABS: { tab: Tab; href: string; icon: TemplateResult; label: string }[] = [
  { tab: "home", href: href.home(), icon: icons.home, label: "Home" },
  { tab: "search", href: href.search(), icon: icons.search, label: "Search" },
  { tab: "reachOut", href: href.reachOut(), icon: icons.bell, label: "Reach out" },
  { tab: "add", href: href.add(), icon: icons.plusCircle, label: "Add" },
];

// Claude sits between Search and Reach Out, as on iOS. It's an action, not a
// destination: it opens Claude, where the Notion connector already lives.
function tabBar(): TemplateResult {
  const link = (t: (typeof TABS)[number]) =>
    html`<a href=${t.href} class=${state.lastTab === t.tab ? "active" : ""} aria-label=${t.label} title=${t.label}
      aria-current=${state.lastTab === t.tab ? "page" : "false"}>${t.icon}</a>`;
  return html`<nav class="tabbar">
    ${TABS.slice(0, 2).map(link)}
    <a href=${CLAUDE_URL} target="_blank" rel="noopener noreferrer" aria-label="Talk to Claude" title="Talk to Claude">${icons.mic}</a>
    ${TABS.slice(2).map(link)}
  </nav>`;
}

// A sync failure keeps the cached data on screen and says how old it is.
function staleBanner(): TemplateResult | typeof nothing {
  const status = state.data?.status;
  if (!status?.lastError || !status.fetchedAt) return nothing;
  return html`<div class="banner">${status.lastError} Showing data from ${ago(status.fetchedAt)}.</div>`;
}

function shell(view: View): TemplateResult {
  return html`<div class="shell">
    ${view.back || view.title || view.actions.length
      ? html`<header class="topbar">
          ${view.back
            ? html`<button class="icon-btn" aria-label="Back" title="Back" @click=${() => goBack(href.home())}>
                ${icons.back}
              </button>`
            : nothing}
          <span class="title">${view.title ?? ""}</span>
          ${view.actions.map(topBarAction)}
          <button class="icon-btn muted" aria-label="Refresh" title="Refresh" ?disabled=${state.refreshing} @click=${() => void refresh()}>
            ${icons.refresh}
          </button>
        </header>`
      : nothing}
    <main class="content" id="content">
      <div class="ptr" id="ptr"><div class="spinner"></div></div>
      ${staleBanner()} ${view.body}
    </main>
    ${tabBar()} ${view.overlay ?? nothing} ${state.toast ? html`<div class="toast" role="status">${state.toast}</div>` : nothing}
  </div>`;
}

const root = document.getElementById("app") as HTMLElement;

function renderApp() {
  const phase = state.phase;
  let template: TemplateResult;
  if (phase.kind === "loading") template = loadingScreen();
  else if (phase.kind === "notAllowed") template = notAllowedScreen(phase.userId);
  else if (phase.kind === "error") template = errorScreen(phase.message);
  else if (!state.data?.snapshot) template = state.data?.status.isRefreshing ? loadingScreen("First sync with Notion…") : setupScreen();
  else template = shell(viewFor(state.route));
  render(template, root);
}

// Each screen keeps its scroll position for when you come back to it.
const scrollPositions = new Map<string, number>();
let currentHash = location.hash;

window.addEventListener("hashchange", () => {
  const content = document.getElementById("content");
  if (content) scrollPositions.set(currentHash, content.scrollTop);
  currentHash = location.hash;
  noteNavigation();
  const route = parseRoute(location.hash);
  update((s) => {
    s.route = route;
    s.lastTab = tabOf(route) ?? s.lastTab;
    s.phonePicker = null;
    s.confirmDelete = null;
  });
  requestAnimationFrame(() => {
    const next = document.getElementById("content");
    if (next) next.scrollTop = scrollPositions.get(currentHash) ?? 0;
    if (route.name === "search") document.getElementById("search-field")?.focus();
  });
});

// Pull to refresh: drag down from the top of a screen past the threshold.
const THRESHOLD = 70;
let startY: number | null = null;
let pulled = 0;
document.addEventListener(
  "touchstart",
  (e) => {
    const content = document.getElementById("content");
    const touch = e.touches[0];
    startY = content && touch && content.scrollTop <= 0 && content.contains(e.target as Node) ? touch.clientY : null;
    pulled = 0;
  },
  { passive: true },
);
document.addEventListener(
  "touchmove",
  (e) => {
    const touch = e.touches[0];
    if (startY === null || !touch) return;
    pulled = Math.max(0, Math.min(110, (touch.clientY - startY) * 0.5));
    const ptr = document.getElementById("ptr");
    if (ptr) ptr.style.height = `${pulled}px`;
  },
  { passive: true },
);
document.addEventListener("touchend", () => {
  const ptr = document.getElementById("ptr");
  if (startY !== null && pulled >= THRESHOLD) {
    if (ptr) ptr.style.height = "48px";
    void refresh().finally(() => {
      if (ptr) ptr.style.height = "0";
    });
  } else if (ptr) {
    ptr.style.height = "0";
  }
  startY = null;
  pulled = 0;
});

setRenderer(renderApp);
state.lastTab = tabOf(state.route) ?? "home";
renderApp();
void load();
