import { expect, test } from "@playwright/test";

test("technician saves preparation through visible controls and reopens it", async ({ page, browser }, testInfo) => {
  test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required");
  test.setTimeout(90000);
  await test.step("Manager assigns an existing demo turn using the drawer", async () => {
    const manager = await browser.newPage({ viewport: page.viewportSize()! });
    try {
      await manager.goto(testInfo.project.use.baseURL!);
      await manager.getByTestId("login-email").fill(process.env.ADMIN_EMAIL!);
      await manager.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD!);
      await manager.getByRole("button", { name: /sign in/i }).click();
      await manager.getByRole("button", { name: "Open details for DG-101", exact: true }).click();
      await manager.getByRole("button", { name: "All details", exact: true }).click();
      await manager.getByTestId("drawer-field-assignedTech").selectOption("Demo Tech");
      await expect(manager.getByTestId("drawer-field-assignedTech")).toBeEnabled();
      await manager.getByTestId("item-drawer-close").click();
      await manager.reload();
      await manager.getByRole("button", { name: "Open details for DG-101", exact: true }).click();
      await manager.getByRole("button", { name: "All details", exact: true }).click();
      await expect(manager.getByTestId("drawer-field-assignedTech")).toHaveValue("Demo Tech");
    } finally { await manager.close(); }
  });
  await test.step("Sign in as the demo technician", async () => {
    await page.goto("/");
    await page.getByTestId("login-email").fill(process.env.DEMO_TECH_EMAIL!);
    await page.getByTestId("login-password").fill(process.env.DEMO_TECH_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByTestId("my-work-panel")).toBeVisible();
  });
  const card = page.locator('[data-testid^="my-work-item-"]').filter({ has: page.getByRole("button", { name: "Open work item", exact: true }) }).first();
  await expect(card).toBeVisible();
  const cardId = await card.getAttribute("data-testid");
  await testInfo.attach("my-work", { body: await page.screenshot({ path: testInfo.outputPath("my-work.png"), fullPage: true }), contentType: "image/png" });
  await card.getByRole("button", { name: "Open work item", exact: true }).click();
  const panel = page.getByTestId("resident-codes-panel");
  await test.step("Record preparation and resident details", async () => {
    await expect(panel).toBeVisible();
    const checks = panel.locator('[data-testid^="tech-check-"]');
    await expect(checks).toHaveCount(8);
    for (const check of await checks.all()) await check.selectOption("CHECKED");
    await panel.getByLabel("Home keys made", { exact: true }).fill("2");
    await panel.getByLabel("Mailbox key count", { exact: true }).fill("1");
    await panel.getByLabel("Access fobs prepared", { exact: true }).fill("0");
    await panel.getByLabel("Garage remotes prepared", { exact: true }).fill("0");
    await panel.getByLabel("New resident door code", { exact: true }).fill("4826");
    await panel.getByRole("button", { name: "Save preparation & resident details", exact: true }).click();
    await expect(panel).toContainText("Preparation and resident details saved.");
  });
  await test.step("Reload and verify the saved values as the technician", async () => {
    await page.getByTestId("item-drawer-close").click();
    await page.reload();
    await page.getByTestId(cardId!).getByRole("button", { name: "Open work item", exact: true }).click();
    for (const check of await panel.locator('[data-testid^="tech-check-"]').all()) await expect(check).toHaveValue("CHECKED");
    await expect(panel.getByLabel("Home keys made", { exact: true })).toHaveValue("2");
    await expect(panel.getByLabel("Mailbox key count", { exact: true })).toHaveValue("1");
    await panel.getByRole("button", { name: "Show codes", exact: true }).click();
    await expect(panel.getByLabel("New resident door code", { exact: true })).toHaveValue("4826");
    await testInfo.attach("saved-preparation", { body: await page.screenshot({ path: testInfo.outputPath("saved-preparation.png") }), contentType: "image/png" });
  });
});
