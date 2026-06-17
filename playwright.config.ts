import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testMatch: ["**/auth-and-shell.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visual-chrome",
      testMatch: ["**/visual-*.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      testMatch: ["**/mobile-*.spec.ts"],
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 412, height: 915 },
      },
    },
  ],
});
