import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/components",
  use: { baseURL: "http://127.0.0.1:5174", serviceWorkers: "block", screenshot: "only-on-failure" },
  webServer: {
    command: "npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
