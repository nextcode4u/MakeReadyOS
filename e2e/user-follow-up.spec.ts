import { expect, test, type Page } from "@playwright/test";

test("inspector returns a photo correction and technician completes the reinspection loop", async ({ page, browser }, info) => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
  test.setTimeout(180000);
  const unit = info.project.name === "user-mobile" ? "DG-105" : "DG-110";
  const navigate = async (target: Page, tab: string) => {
    if (await target.getByTestId("mobile-views-toggle").isVisible()) await target.getByTestId("mobile-views-toggle").click();
    await target.getByTestId(`tab-${tab}`).click();
  };
  const login = async (target: Page, email: string, password: string) => {
    target.setDefaultTimeout(15000);
    await target.goto(info.project.use.baseURL!);
    await target.getByTestId("login-email").fill(email);
    await target.getByTestId("login-password").fill(password);
    await target.getByRole("button", { name: /sign in/i }).click();
    await expect(target.getByTestId("property-filter")).toBeVisible();
  };
  const tech = await browser.newPage({ ...info.project.use, baseURL: info.project.use.baseURL });
  const inspector = await browser.newPage({ ...info.project.use, baseURL: info.project.use.baseURL });
  try {
    await test.step("Manager configures the inspector and assigns the unit", async () => {
      await login(page, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
      await navigate(page, "automations");
      const guide = page.getByTestId("final-walk-guide");
      await guide.getByLabel("Final walks for").selectOption({ label: "DG / Demo Gardens" });
      await expect(guide.getByLabel("Add inspector")).toBeVisible();
      if (await guide.getByRole("button", { name: "Remove inspector 1", exact: true }).count() === 0) {
        await guide.getByLabel("Add inspector").selectOption({ label: "Demo Leasing / LEASING" });
      }
      await guide.getByRole("button", { name: "Save and assign final walks", exact: true }).click();
      await expect(guide).toContainText("Inspector order saved.");
      await navigate(page, "table");
      await page.getByRole("button", { name: `Open details for ${unit}`, exact: true }).click();
      await page.getByRole("button", { name: "All details", exact: true }).click();
      for (const [field, value] of [["assignedTech", "Demo Tech"], ["paintStatus", "DONE"], ["cleaningStatus", "DONE"]]) {
        const input = page.getByTestId(`drawer-field-${field}`);
        await input.selectOption(value);
        await expect(input).toBeEnabled();
      }
    });
    await login(tech, process.env.DEMO_TECH_EMAIL!, process.env.DEMO_TECH_PASSWORD!);
    const card = tech.locator('[data-testid^="my-work-item-"]').filter({ hasText: unit });
    const preparation = tech.getByTestId("resident-codes-panel");
    await test.step("Technician records preparation and finishes repairs", async () => {
      await card.getByRole("button", { name: "Open work item", exact: true }).click();
      await expect(preparation.locator('[data-testid^="tech-check-"]')).toHaveCount(8);
      for (const check of await preparation.locator('[data-testid^="tech-check-"]').all()) await check.selectOption("CHECKED");
      for (const label of ["Home keys made", "Mailbox key count", "Access fobs prepared", "Garage remotes prepared"]) await preparation.getByLabel(label, { exact: true }).fill("0");
      await preparation.getByRole("button", { name: "Save preparation & resident details", exact: true }).click();
      await expect(preparation).toContainText("Preparation and resident details saved.");
      await tech.getByTestId("item-drawer-close").click();
      await card.getByLabel(`Repair status ${unit}`, { exact: true }).selectOption("DONE");
      await expect(card).toContainText("Pending final walk");
    });
    const report = inspector.getByTestId("final-report-editor");
    const inspectionCard = inspector.locator('[data-testid^="my-work-item-"]').filter({ hasText: unit });
    await test.step("Inspector sends a photo and repair instructions", async () => {
      await login(inspector, process.env.DEMO_LEASING_EMAIL!, process.env.DEMO_LEASING_PASSWORD!);
      await navigate(inspector, "my-work");
      await inspectionCard.getByRole("button", { name: "Inspect or hand off", exact: true }).click();
      await inspector.getByRole("button", { name: "Inspection details / report", exact: true }).click();
      await expect(report.getByTestId("final-report-date")).not.toHaveValue("");
      await report.getByLabel("Internal follow-up for technician", { exact: true }).fill("Replace damaged cabinet face from stock; see photo.");
      await report.getByLabel("Add follow-up photos (up to 12)", { exact: true }).setInputFiles({ name: "cabinet.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=", "base64") });
      await expect(report.getByTestId("follow-up-photos").getByRole("img")).toHaveCount(1);
      await report.getByRole("button", { name: "Save and send corrections to technician", exact: true }).click();
      await expect(report).toBeHidden();
      await inspector.getByTestId("item-drawer-close").click();
      await expect(inspector.getByTestId("item-drawer")).toBeHidden();
    });
    await test.step("Technician reviews the photo and resolves the separate follow-up", async () => {
      await tech.reload();
      await expect(tech.getByTestId("my-work-group-follow-ups").filter({ hasText: unit })).toBeVisible();
      await card.getByRole("button", { name: "Open corrections", exact: true }).click();
      await tech.getByRole("button", { name: "Review corrections", exact: true }).click();
      await expect(preparation).toContainText("Replace damaged cabinet face from stock");
      await preparation.getByRole("button", { name: "Enlarge photo 1", exact: true }).click();
      const photo = tech.getByRole("dialog", { name: "Follow-up photo", exact: true });
      await expect(photo.getByRole("img")).toBeVisible();
      await expect(photo.getByRole("img")).toHaveJSProperty("naturalWidth", 1);
      await info.attach("technician-photo", { body: await tech.screenshot(), contentType: "image/png" });
      await photo.getByRole("button", { name: "Close dialog", exact: true }).click();
      await preparation.getByLabel("Technician resolution", { exact: true }).fill("Damaged face replaced from shop stock.");
      await preparation.getByRole("button", { name: "Save preparation & resident details", exact: true }).click();
      await expect(preparation).toContainText("Preparation and resident details saved.");
      await tech.getByTestId("item-drawer-close").click();
      await card.getByLabel(`Repair status ${unit}`, { exact: true }).selectOption("DONE");
    });
    await test.step("Inspector rechecks, marks ready, and downloads the resident PDF", async () => {
      await inspector.reload();
      await inspectionCard.getByRole("button", { name: "Inspect or hand off", exact: true }).click();
      await inspector.getByRole("button", { name: "Inspection details / report", exact: true }).click();
      await expect(report).toContainText("Damaged face replaced from shop stock.");
      for (const check of await report.locator('[data-testid^="final-report-result-"]').all()) await check.selectOption("CHECKED");
      await report.getByLabel("I counted and confirmed the home/mailbox keys, fobs and remotes for handoff", { exact: true }).check();
      await report.getByRole("button", { name: "Save inspection draft", exact: true }).click();
      await report.getByTestId("final-report-mark-ready").click();
      await expect(report.getByTestId("final-report-completion")).toContainText("Unit marked ready");
      const download = inspector.waitForEvent("download");
      await report.getByRole("button", { name: "Download resident PDF", exact: true }).click();
      expect(await (await download).failure()).toBeNull();
      await info.attach("inspection-ready", { body: await inspector.screenshot(), contentType: "image/png" });
    });
  } finally { await tech.close(); await inspector.close(); }
});
