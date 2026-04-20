import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: "list",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:5000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "e2e",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
