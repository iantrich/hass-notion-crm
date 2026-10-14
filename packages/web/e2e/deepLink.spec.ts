import { expect, test, type Page } from "@playwright/test";

// A stand-in for Home Assistant's app panel, served from the same origin as
// Thread (as ingress is): it embeds Thread in an iframe, answers its
// subscribe message with "home-assistant/properties" like ha-panel-app does,
// and records the navigate requests Thread sends back.
const PANEL = "/app/test_thread";

async function fakePanel(page: Page, tail: string, { answers = true } = {}) {
  await page.route(`**${PANEL}**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body style="margin:0">
        <iframe id="app" src="/" style="width:100vw;height:100vh;border:0"></iframe>
        <script>
          window.navigations = [];
          const frame = document.getElementById("app");
          window.sendRoute = (path) => frame.contentWindow.postMessage(
            { type: "home-assistant/properties", narrow: true, route: { prefix: "${PANEL}", path } }, "*");
          addEventListener("message", (e) => {
            if (e.data.type === "home-assistant/subscribe-properties" && ${answers}) sendRoute(location.pathname.slice("${PANEL}".length));
            if (e.data.type === "home-assistant/navigate") {
              navigations.push(e.data.path);
              history.replaceState(null, "", e.data.path);
            }
          });
        </script></body>`,
    }),
  );
  await page.goto(`${PANEL}${tail}`);
  return page.frameLocator("#app");
}

test("a notification URL opens the screen it names, then clears the tail", async ({ page }) => {
  const app = await fakePanel(page, "/person/mock-drew");
  await expect(app.getByText("Drew Chen").first()).toBeVisible();
  await expect(app.getByRole("button", { name: "Log interaction" })).toBeVisible();
  // Asked HA to drop the tail, so a reload starts at Home.
  await expect.poll(() => page.evaluate(() => (window as unknown as { navigations: string[] }).navigations)).toContain(PANEL);
  expect(new URL(page.url()).pathname).toBe(PANEL);
});

test("a route change while Thread is open navigates too", async ({ page }) => {
  const app = await fakePanel(page, "");
  await expect(app.getByText("Upcoming")).toBeVisible();
  await page.evaluate(() => (window as unknown as { sendRoute: (p: string) => void }).sendRoute("/reach-out"));
  await expect(app.getByText("CLOSE FRIEND ROTATION · ~6WK CADENCE")).toBeVisible();
});

test("an unknown tail is ignored", async ({ page }) => {
  const app = await fakePanel(page, "/not-a-screen");
  await expect(app.getByText("Upcoming")).toBeVisible();
});

test("without the properties message, the panel's address alone is enough", async ({ page }) => {
  const app = await fakePanel(page, "/birthdays", { answers: false });
  await expect(app.getByRole("link", { name: /Pat Morgan/ })).toBeVisible();
  await expect(app.locator(".topbar .title")).toHaveText("Birthdays");
});
