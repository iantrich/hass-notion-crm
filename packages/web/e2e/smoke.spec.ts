import { expect, test, type Page } from "@playwright/test";

// The mock server's data is made up (see packages/server/src/mock). Each test
// gets a fresh page, but the server's in-memory data is shared, so tests use
// different people.

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

test("home shows favorites, birthdays and recent interactions", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByText("Upcoming")).toBeVisible();
  await expect(page.getByRole("link", { name: /Alex/ }).first()).toBeVisible();
  await expect(page.getByText("Coffee downtown")).toBeVisible();
  expect(errors).toEqual([]);
});

test("log, edit and delete an interaction", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/#/person/mock-drew");
  await page.getByRole("button", { name: "Log interaction" }).click();
  await page.getByRole("button", { name: "Trip" }).click();
  await page.getByLabel("Summary").fill("Weekend in Lincoln");
  await page.getByLabel("Notes").fill("Saw the game");
  await page.getByRole("button", { name: "Save to Notion" }).click();

  // Back on the person, the new interaction leads the timeline.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const entry = page.getByRole("link", { name: /Weekend in Lincoln/ });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("TRIP");

  await entry.click();
  await expect(page.getByText("Saw the game")).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Summary").fill("Weekend in Omaha");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Weekend in Omaha")).toBeVisible();

  await page.getByRole("button", { name: "Delete interaction" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/#\/person\/mock-drew$/);
  await expect(page.getByText("Weekend in Omaha")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("toggle a favorite", async ({ page }) => {
  await page.goto("/#/person/mock-morgan");
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "MP Morgan" })).toBeVisible();
});

test("search finds people and their connections", async ({ page }) => {
  await page.goto("/#/search");
  await page.getByPlaceholder("Search").fill("okafor");
  // Robin directly, and Sam through their College Friend relationship.
  await expect(page.locator('a[href="#/person/mock-robin"]')).toBeVisible();
  await expect(page.getByText("College Friend of Robin Okafor")).toBeVisible();
  await page.getByRole("button", { name: "Households" }).click();
  await page.getByPlaceholder("Search").fill("rivera");
  await expect(page.getByRole("link", { name: /Rivera/ })).toBeVisible();
});

test("add a person", async ({ page }) => {
  await page.goto("/#/add");
  await page.getByLabel("Name").fill("Jordan Lee");
  await page.getByLabel("Has a known birthday").check();
  await page.getByRole("textbox", { name: "Birthday" }).fill("1992-04-03");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Added Jordan Lee");
  await page.goto("/#/search");
  await page.getByPlaceholder("Search").fill("jordan");
  await expect(page.getByRole("link", { name: /Jordan Lee/ })).toBeVisible();
});

test("contact links open outside the iframe", async ({ page }) => {
  await page.goto("/#/person/mock-pat");
  // target=_blank is the only form the iOS Companion app hands to Phone,
  // Messages and Mail (spike result).
  for (const name of ["Call", "Message", "Email"]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute("target", "_blank");
  }
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+15555550102");
});

test("settings shows notification times and sends a test", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Birthdays")).toBeVisible();
  await expect(page.getByText("Close friends at 6 weeks")).toBeVisible();
  await expect(page.getByText("21:00")).toBeVisible();
  await expect(page.getByText("mobile_app_test")).toBeVisible();
  await page.getByRole("button", { name: "Send test notification" }).click();
  await expect(page.getByRole("status")).toContainText("Test sent");
  expect(errors).toEqual([]);
});

test("settings offers a home screen shortcut", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(page.getByText(/^homeassistant:\/\/navigate\/app\//)).toBeVisible();
  const icon = await page.request.get("/icon-512.png");
  expect(icon.headers()["content-type"]).toBe("image/png");
});
