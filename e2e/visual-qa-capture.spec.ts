import { expect, test, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456";

const captureRoot = path.resolve(process.cwd(), "test-results/visual-qa");

type DisplayMode = {
  key: string;
  theme: "default" | "dark" | "light";
  eyeStrain?: boolean;
  dyslexia?: boolean;
};

type WorkspaceCapture = {
  key: string;
  open: (page: Page) => Promise<void>;
  ready: () => string;
};

async function login(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByTestId("login-email").fill(adminEmail);
  await page.getByTestId("login-password").fill(adminPassword);
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("heading", { name: "MakeReadyOS" })).toBeVisible();
}

async function setDisplayMode(page: Page, input: DisplayMode) {
  await page.getByTestId("theme-mode-select").selectOption(input.theme);
  await page.getByTestId("eye-strain-mode-toggle").setChecked(Boolean(input.eyeStrain));
  await page.getByTestId("dyslexia-mode-toggle").setChecked(Boolean(input.dyslexia));
  await expect(page.locator("html")).toHaveAttribute("data-theme", input.theme);
  if (input.eyeStrain) {
    await expect(page.locator("html")).toHaveClass(/eye-strain-mode/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/eye-strain-mode/);
  }
  if (input.dyslexia) {
    await expect(page.locator("html")).toHaveClass(/dyslexia-mode/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dyslexia-mode/);
  }
}

async function capture(page: Page, testInfo: TestInfo, mode: DisplayMode, workspace: WorkspaceCapture) {
  await workspace.open(page);
  await expect(page.getByTestId(workspace.ready())).toBeVisible();
  await page.waitForTimeout(250);

  const fileName = `${mode.key}__${workspace.key}.png`;
  const outputPath = path.join(captureRoot, fileName);
  await fs.mkdir(captureRoot, { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
  await testInfo.attach(fileName, { path: outputPath, contentType: "image/png" });
}

test.describe("visual QA capture", () => {
  test("capture desktop review bundle for theme and dense workspace pass", async ({ page }, testInfo) => {
    await login(page);

    await page.getByTestId("compact-mode-toggle").setChecked(true);
    await expect(page.locator(".app-shell")).toHaveClass(/compact-mode/);

    const modes: DisplayMode[] = [
      { key: "default", theme: "default" },
      { key: "light", theme: "light" },
      { key: "eye-strain", theme: "dark", eyeStrain: true },
      { key: "dyslexia", theme: "light", dyslexia: true },
    ];

    const workspaces: WorkspaceCapture[] = [
      { key: "table", open: async (currentPage) => currentPage.getByTestId("tab-table").click(), ready: () => "board-table-view" },
      { key: "dashboard", open: async (currentPage) => currentPage.getByTestId("tab-dashboard").click(), ready: () => "dashboard-panel" },
      { key: "projects", open: async (currentPage) => currentPage.getByTestId("module-rail-projects").click(), ready: () => "projects-panel" },
      { key: "pest", open: async (currentPage) => currentPage.getByTestId("module-rail-pest").click(), ready: () => "pest-control-panel" },
      { key: "lease", open: async (currentPage) => currentPage.getByTestId("module-rail-lease-compliance").click(), ready: () => "lease-compliance-panel" },
      { key: "pm", open: async (currentPage) => currentPage.getByTestId("module-rail-pm").click(), ready: () => "preventive-maintenance-panel" },
      { key: "wiki", open: async (currentPage) => currentPage.getByTestId("module-rail-property-wiki").click(), ready: () => "property-wiki-panel" },
      { key: "maps", open: async (currentPage) => currentPage.getByTestId("tab-maps").click(), ready: () => "property-maps-panel" },
      { key: "admin", open: async (currentPage) => currentPage.getByTestId("tab-admin").click(), ready: () => "admin-panel" },
    ];

    for (const mode of modes) {
      await test.step(`capture ${mode.key}`, async () => {
        await setDisplayMode(page, mode);
        for (const workspace of workspaces) {
          await capture(page, testInfo, mode, workspace);
        }
      });
    }
  });
});
