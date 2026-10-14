import { defineConfig } from "@playwright/test";

// End-to-end tests drive the built web app against the server in mock mode.
// Run `npm run build -w @thread/web` first.
export default defineConfig({
  testDir: "packages/web/e2e",
  use: {
    baseURL: "http://localhost:8099",
    viewport: { width: 390, height: 844 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    // A notify target, so the settings screen's test button is live. Outside
    // Home Assistant the sender only logs what it would send.
    command:
      "mkdir -p test-results/e2e-data && echo '{\"notify_targets\":[\"mobile_app_test\"]}' > test-results/e2e-data/options.json && npx tsx packages/server/src/main.ts",
    url: "http://localhost:8099/api/snapshot",
    reuseExistingServer: false,
    env: {
      THREAD_DEV: "1",
      THREAD_MOCK: "1",
      THREAD_DATA_DIR: "test-results/e2e-data",
      THREAD_WEB_DIR: "packages/web/dist",
    },
  },
});
