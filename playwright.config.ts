import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";

const port = process.env.E2E_PORT || "3100";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15_000,
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      CANTERA_MODE: "local",
      PROVIDER_MODE: "fixture",
      PLACES_MODE: "fixture",
      AI_MODE: "fixture",
      CANTERA_DATA_DIR: path.join(os.tmpdir(), `cantera-e2e-${process.pid}`),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
