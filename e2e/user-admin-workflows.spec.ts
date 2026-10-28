import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email = process.env.ADMIN_EMAIL!, password = process.env.ADMIN_PASSWORD!) {
  await page.goto("/");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
}
async function tab(page: Page, name: string) {
  const toggle = page.getByTestId("mobile-views-toggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("tab", { name, exact: true }).click();
}
test.beforeEach(() => test.skip(!process.env.COMPOSE_PROJECT_NAME?.startsWith("makereadyos-e2e-"), "Disposable demo environment required"));

test("directory and availability imports preserve turn work and accept an extended vacate date", async ({ page }, info) => {
  test.setTimeout(120000);
  const unit = info.project.name === "user-mobile" ? "AUDIT-M" : "AUDIT-D";
  const openUnit = () => page.getByTestId(`${info.project.name === "user-mobile" ? "mobile" : "item"}-details-${unit.toLowerCase()}`).click();
  const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const directory = (status: string) => `unit,floorPlan,occupancyStatus,currentResidentName,currentResidentMoveInDate\n${unit},A1,${status},Demo Occupant,2025-01-15`;
  const availability = (vacate: string, report: string) => `unit,floorPlan,availabilityStatus,vacancyStatus,moveOutDate,reportDate\n${unit},A1,NTV Not Leased,NTV NOT LEASED,${vacate},${report}`;
  await login(page);
  await page.getByTestId("property-filter").selectOption({ label: "DG · Demo Gardens" });
  await tab(page, "Availability & Units");
  await page.getByTestId("inventory-tab-directory").click();
  await page.getByTestId("unit-import-property").selectOption({ label: "DG - Demo Gardens" });
  await page.getByTestId("unit-import-csv").fill(directory("OCCUPIED"));
  await expect(page.getByTestId("unit-import-preview")).toContainText("1 new");
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("unit-import-submit").click();
  await expect(page.getByTestId("unit-import-last-import")).toContainText("1 created");
  await page.getByTestId("inventory-tab-availability").click();
  await page.getByTestId("availability-import-csv").fill(availability(day(2), day(0)));
  await expect(page.getByTestId("availability-import-preview")).toContainText("1 turns new");
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("availability-import-submit").click();
  await expect(page.getByTestId("availability-import-last-import")).toContainText("1 turns created");
  await tab(page, "Table");
  await page.getByRole("textbox", { name: "Search board items", exact: true }).fill(unit);
  await openUnit();
  await page.getByTestId("drawer-pane-all").click();
  await page.getByTestId("drawer-notes").fill("Retain this repair scope through imports.");
  await page.getByTestId("drawer-notes").press("Tab");
  await expect(page.getByTestId("drawer-notes")).toBeEnabled();
  await page.getByTestId("item-drawer-close").click();
  await tab(page, "Availability & Units");
  await page.getByTestId("inventory-tab-directory").click();
  await page.getByTestId("unit-import-csv").fill(directory("VACANT NOT LEASED READY"));
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("unit-import-submit").click();
  await expect(page.getByTestId("unit-import-csv")).toHaveValue("");
  await tab(page, "Table");
  await openUnit();
  await page.getByTestId("drawer-pane-all").click();
  await expect(page.getByTestId("drawer-field-vacancyStatus")).toHaveValue("NTV NOT LEASED");
  await expect(page.getByTestId("drawer-field-moveOutDate")).toHaveValue(day(2));
  await page.getByTestId("item-drawer-close").click();
  await tab(page, "Availability & Units");
  await page.getByTestId("inventory-tab-availability").click();
  await page.getByTestId("availability-import-csv").fill(availability(day(7), day(1)));
  page.once("dialog", dialog => dialog.accept());
  await page.getByTestId("availability-import-submit").click();
  await expect(page.getByTestId("availability-import-csv")).toHaveValue("");
  await tab(page, "Table");
  await openUnit();
  await page.getByTestId("drawer-pane-all").click();
  await expect(page.getByTestId("drawer-notes")).toHaveValue("Retain this repair scope through imports.");
  await expect(page.getByTestId("drawer-field-moveOutDate")).toHaveValue(day(7));
  await expect(page.getByTestId("drawer-field-vacancyStatus")).toHaveValue("NTV NOT LEASED");
});

test("scoped manager and admin receive a technician parts request without exposing admin tools to staff", async ({ page, browser }, info) => {
  test.setTimeout(120000);
  const email = `audit-manager-${info.project.name}@example.test`;
  const part = `Audit replacement latch ${info.project.name}`;
  await login(page);
  await tab(page, "Admin");
  await page.getByTestId("admin-use-email-as-username").check();
  await page.getByTestId("admin-create-full-name").fill(`Audit Manager ${info.project.name}`);
  await page.getByTestId("admin-create-email").fill(email);
  await page.getByTestId("admin-create-role").selectOption("MANAGER");
  await page.getByTestId("admin-create-send-invite").uncheck();
  await page.getByTestId("admin-create-password").fill(process.env.DEMO_TECH_PASSWORD!);
  await page.getByTestId("admin-create-property-DG").check();
  await page.getByTestId("admin-create-property-DS").uncheck();
  await page.getByTestId("admin-create-user-button").click();
  await expect(page.getByTestId("admin-create-full-name")).toHaveValue("");
  await tab(page, "Table");
  await page.getByRole("button", { name: "Open details for DG-101", exact: true }).click();
  await page.getByTestId("drawer-pane-all").click();
  await page.getByTestId("drawer-field-assignedTech").selectOption("Demo Tech");
  await expect(page.getByTestId("drawer-field-assignedTech")).toBeEnabled();
  await page.getByTestId("item-drawer-close").click();
  const manager = await browser.newPage({ viewport: page.viewportSize()! });
  const tech = await browser.newPage({ viewport: page.viewportSize()! });
  const leasing = await browser.newPage({ viewport: page.viewportSize()! });
  try {
    await login(manager, email, process.env.DEMO_TECH_PASSWORD!);
    await expect(manager.getByTestId("property-filter").locator("option")).not.toContainText(["DS · Demo Springs"]);
    await expect(manager.getByRole("tab", { name: "Admin", exact: true })).toHaveCount(0);
    await tab(manager, "Availability & Units");
    await expect(manager.getByTestId("availability-import-file")).toBeVisible();
    await login(leasing, process.env.DEMO_LEASING_EMAIL!, process.env.DEMO_LEASING_PASSWORD!);
    await expect(leasing.getByRole("tab", { name: "Admin", exact: true })).toHaveCount(0);
    await expect(leasing.getByRole("tab", { name: "Availability & Units", exact: true })).toHaveCount(0);
    await login(tech, process.env.DEMO_TECH_EMAIL!, process.env.DEMO_TECH_PASSWORD!);
    await expect(tech.getByRole("tab", { name: "Admin", exact: true })).toHaveCount(0);
    await expect(tech.getByRole("tab", { name: "Availability & Units", exact: true })).toHaveCount(0);
    await tech.locator('[data-testid^="my-work-item-"]').filter({ hasText: "DG-101" }).getByRole("button", { name: "Open work item", exact: true }).click();
    await tech.getByTestId("drawer-pane-work").click();
    const materials = tech.getByTestId("turn-materials");
    await materials.getByRole("textbox", { name: "Part 1", exact: true }).fill(part);
    await materials.getByRole("button", { name: "Save parts list", exact: true }).click();
    await materials.getByRole("combobox", { name: `Status ${part}`, exact: true }).selectOption("NEED_TO_ORDER");
    await expect(materials.getByRole("combobox", { name: `Status ${part}`, exact: true })).toBeEnabled();
    for (const recipient of [page, manager]) {
      await recipient.reload();
      await recipient.getByTestId("notifications-button").click();
      const alerts = recipient.getByTestId("notification-drawer");
      await expect(alerts.locator(".notification-item").filter({ hasText: part })).toHaveCount(1);
    }
  } finally { await manager.close(); await tech.close(); await leasing.close(); }
});

test("alert preferences persist, offline quiet-hour saves explain failure, and clearing is guarded", async ({ page, context }) => {
  test.setTimeout(90000);
  await login(page);
  await page.getByTestId("notifications-button").click();
  const drawer = page.getByTestId("notification-drawer");
  await drawer.getByTestId("notification-preferences").locator("summary").click();
  if (!await drawer.getByLabel("Status changes", { exact: true }).first().isChecked()) {
    await drawer.getByLabel("Status changes", { exact: true }).first().click();
  }
  await expect(drawer.getByLabel("Status changes", { exact: true }).first()).toBeChecked();
  await drawer.getByRole("button", { name: "Need-to-know only", exact: true }).click();
  await expect(drawer.getByLabel("Status changes", { exact: true }).first()).not.toBeChecked();
  await expect(drawer.getByLabel("Parts need ordering", { exact: true }).first()).toBeChecked();
  await drawer.getByLabel("Start", { exact: true }).fill("21:15");
  await context.setOffline(true);
  try {
    await drawer.getByRole("button", { name: "Save quiet hours", exact: true }).click();
    await expect(drawer.getByRole("alert")).toBeVisible();
    await expect(drawer.getByLabel("Start", { exact: true })).toHaveValue("21:15");
  } finally { await context.setOffline(false); }
  await drawer.getByRole("button", { name: "Save quiet hours", exact: true }).click();
  await expect(drawer).toContainText("Quiet hours saved.");
  await drawer.getByRole("button", { name: "Close notifications", exact: true }).click();
  await page.reload();
  await page.getByTestId("notifications-button").click();
  await drawer.getByTestId("notification-preferences").locator("summary").click();
  await expect(drawer.getByLabel("Start", { exact: true })).toHaveValue("21:15");
  page.once("dialog", dialog => dialog.dismiss());
  await drawer.getByTestId("notifications-clear-all").click();
  await expect(drawer.locator(".notification-item").first()).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await drawer.getByTestId("notifications-clear-all").click();
  await expect(drawer).toContainText("alerts cleared.");
  await expect(drawer.locator(".notification-item")).toHaveCount(0);
});

test("duplicate import rows explain which unit was skipped", async ({ page }, info) => {
  const unit = `DUP-${info.project.name === "user-mobile" ? "M" : "D"}`;
  await login(page);
  await page.getByTestId("property-filter").selectOption({ label: "DG · Demo Gardens" });
  await tab(page, "Availability & Units");
  for (const kind of ["unit", "availability"]) {
    await page.getByTestId(`inventory-tab-${kind === "unit" ? "directory" : "availability"}`).click();
    await page.getByTestId(`${kind}-import-property`).selectOption({ label: "DG - Demo Gardens" });
    const csv = `unit,floorPlan,occupancyStatus,vacancyStatus\n${unit},A1,VACANT NOT LEASED NOT READY,VACANT NOT LEASED NOT READY\n${unit},A1,VACANT NOT LEASED NOT READY,VACANT NOT LEASED NOT READY`;
    await page.getByTestId(`${kind}-import-file`).setInputFiles({ name: "duplicate-demo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByTestId(`${kind}-import-preview`)).toContainText("2 rows");
    page.once("dialog", dialog => dialog.accept());
    await page.getByTestId(`${kind}-import-submit`).click();
    await expect(page.getByTestId(`${kind}-import-csv`)).toHaveValue("");
    await expect(page.getByTestId(`${kind}-import-row-errors`)).toContainText(`duplicate unit ${unit}`);
  }
});
