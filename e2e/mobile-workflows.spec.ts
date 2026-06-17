import { expect, test, type Locator, type Page } from "@playwright/test";

const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456";

function uniqueTag(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function loginMobile(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByTestId("login-email").fill(adminEmail);
  await page.getByTestId("login-password").fill(adminPassword);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  await expect(page.getByRole("button", { name: /View:/ })).toBeVisible();
}

async function assertNoPageHorizontalOverflow(page: Page) {
  await expect.poll(() =>
    page.evaluate(() => {
      const overflowWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      return overflowWidth <= window.innerWidth + 4;
    }),
  ).toBe(true);
}

async function openMobileViews(page: Page) {
  await page.getByRole("button", { name: /View:/ }).click();
  await expect(page.locator(".mobile-tabset")).toBeVisible();
}

async function openMobileTools(page: Page) {
  await page.getByRole("button", { name: "Tools" }).click();
  await expect(page.locator(".mobile-filters-panel")).toBeVisible();
}

async function expectHistoryView(page: Page, view: string) {
  await expect.poll(() => page.evaluate(() => window.history.state?.view ?? null)).toBe(view);
}

async function openWorkspaceFromViews(page: Page, tabTestId: string, view: string, panelTestId?: string) {
  await openMobileViews(page);
  await page.getByTestId(tabTestId).click();
  await expectHistoryView(page, view);
  if (panelTestId) {
    await expect
      .poll(async () => {
        const panelCount = await page.getByTestId(panelTestId).count();
        const loadingCount = await page.locator(".panel-state-wrap").count();
        return panelCount > 0 || loadingCount > 0;
      })
      .toBe(true);
  }
  await assertNoPageHorizontalOverflow(page);
}

async function openModuleRailPanel(page: Page, trigger: string, view: string, panelTestId: string) {
  await page.getByTestId(trigger).click();
  await expectHistoryView(page, view);
  await expect(page.getByTestId(panelTestId)).toBeVisible();
  await assertNoPageHorizontalOverflow(page);
}

async function selectFirstRealOption(select: Locator) {
  const optionCount = await select.locator("option").count();
  if (optionCount > 1) {
    await select.selectOption({ index: 1 });
    return true;
  }
  return false;
}

test.describe("mobile workflow coverage", () => {
  test("mobile shell supports view switching, tools, and browser-back drawer behavior", async ({ page }) => {
    await loginMobile(page);

    await openMobileTools(page);
    await expect(page.getByTestId("theme-mode-select")).toBeVisible();
    await expect(page.getByTestId("logout-button")).toBeVisible();

    await openWorkspaceFromViews(page, "tab-dashboard", "dashboard");
    await page.goBack();
    await expectHistoryView(page, "table");
    await expect(page.getByTestId("board-table-view")).toBeVisible();

    const mobileDetailButton = page.locator('[data-testid^="mobile-details-"]').first();
    await expect(mobileDetailButton).toBeVisible();
    await mobileDetailButton.click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("item-drawer")).toHaveCount(0);

    await assertNoPageHorizontalOverflow(page);
  });

  test("mobile navigation keeps operational modules reachable without horizontal overflow", async ({ page }) => {
    await loginMobile(page);

    await openWorkspaceFromViews(page, "tab-my-work", "mywork", "my-work-panel");
    await openWorkspaceFromViews(page, "tab-planning", "planning", "planning-panel");
    await openWorkspaceFromViews(page, "tab-maps", "maps", "property-maps-panel");
    await openWorkspaceFromViews(page, "tab-activity", "activity", "activity-panel");

    await openModuleRailPanel(page, "module-rail-refrigerant", "refrigerant", "refrigerant-panel");
    await openModuleRailPanel(page, "module-rail-pool", "pool", "pool-log-panel");
    await openModuleRailPanel(page, "module-rail-pest", "pest", "pest-control-panel");
    await openModuleRailPanel(page, "module-rail-lease-compliance", "lease", "lease-compliance-panel");
    await openModuleRailPanel(page, "module-rail-pm", "pm", "preventive-maintenance-panel");
    await openModuleRailPanel(page, "module-rail-projects", "projects", "projects-panel");
    await openModuleRailPanel(page, "module-rail-property-wiki", "wiki", "property-wiki-panel");
  });

  test("mobile module workflows cover quick-create paths across pool, pest, lease, projects, PM, wiki, and maps", async ({ page }) => {
    const poolFacility = uniqueTag("Pool");
    const projectTitle = uniqueTag("Project");
    const pestArea = uniqueTag("Pest");
    const leaseArea = uniqueTag("Lease");
    const pmTemplate = uniqueTag("PM");
    const mapName = uniqueTag("Map");

    await loginMobile(page);

    await openModuleRailPanel(page, "module-rail-pool", "pool", "pool-log-panel");
    await page.getByRole("button", { name: "Setup" }).click();
    await page.getByTestId("pool-facility-name").fill(poolFacility);
    await page.getByTestId("pool-facility-submit").click();
    await page.getByRole("button", { name: "Daily log" }).click();
    await expect(page.getByTestId("pool-daily-form")).toBeVisible();
    await page.locator('select[name="facilityId"]').selectOption({ label: poolFacility });
    await expect(page.locator('select[name="facilityId"]')).not.toHaveValue("");
    await page.getByTestId("pool-reading-ph").fill("7.4");
    await page.getByTestId("pool-reading-free-chlorine").fill("2.1");
    await page.getByTestId("pool-daily-submit").click();
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByTestId("pool-history-row").first()).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openModuleRailPanel(page, "module-rail-pest", "pest", "pest-control-panel");
    await page.getByTestId("pest-quick-add-area").fill(pestArea);
    await page.getByTestId("pest-quick-add-description").fill("Mobile pest request coverage.");
    await page.getByTestId("pest-quick-add-submit").click();
    await expect(page.getByText(pestArea, { exact: false })).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openModuleRailPanel(page, "module-rail-lease-compliance", "lease", "lease-compliance-panel");
    await page.getByTestId("lease-quick-capture-building").fill("Building 12");
    await page.getByTestId("lease-quick-capture-area").fill(leaseArea);
    const issueTypeSelect = page.getByTestId("lease-quick-capture-issue-type");
    const issueOptions = await issueTypeSelect.locator("option").count();
    if (issueOptions > 1) {
      await issueTypeSelect.selectOption({ index: 1 });
    }
    await page.getByTestId("lease-quick-capture-description").fill("Mobile lease issue coverage.");
    await page.getByTestId("lease-quick-capture-submit").click();
    await expect(page.getByText(leaseArea, { exact: false })).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openModuleRailPanel(page, "module-rail-projects", "projects", "projects-panel");
    await page.getByTestId("projects-quick-capture-open").click();
    await expect(page.getByTestId("projects-quick-capture-form")).toBeVisible();
    await page.getByTestId("projects-quick-capture-title").fill(projectTitle);
    await page.getByTestId("projects-quick-capture-description").fill("Mobile project quick capture coverage.");
    await page.getByTestId("projects-quick-capture-save").click();
    await expect(page.getByText(`${projectTitle} saved.`, { exact: false })).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openModuleRailPanel(page, "module-rail-pm", "pm", "preventive-maintenance-panel");
    await page.getByRole("button", { name: "Templates" }).click();
    await expect(page.getByTestId("pm-template-form")).toBeVisible();
    await page.getByTestId("pm-template-name").fill(pmTemplate);
    await page.getByTestId("pm-template-submit").click();
    await expect(page.getByText(pmTemplate, { exact: false })).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openModuleRailPanel(page, "module-rail-property-wiki", "wiki", "property-wiki-panel");
    await page.getByTestId("property-wiki-search-input").fill("pool");
    await page.getByTestId("property-wiki-search-submit").click();
    await expect(page.getByTestId("property-wiki-emergency-mode")).toBeVisible();
    await page.getByTestId("property-wiki-emergency-mode").click();
    await expect
      .poll(async () => {
        const emergencyHeading = await page.getByText("Emergency Contacts", { exact: false }).count();
        const emptyState = await page.getByText("No emergency records configured", { exact: false }).count();
        return emergencyHeading > 0 || emptyState > 0;
      })
      .toBe(true);
    await assertNoPageHorizontalOverflow(page);

    await openWorkspaceFromViews(page, "tab-maps", "maps", "property-maps-panel");
    await page.getByTestId("property-maps-create-name").fill(mapName);
    await page.getByTestId("property-maps-create-submit").click();
    await expect(page.getByTestId("property-maps-map-select")).toContainText(mapName);
    await expect(page.getByTestId("property-maps-canvas")).toBeVisible();
    await assertNoPageHorizontalOverflow(page);
  });

  test("mobile create and update flows stay usable for vendors, planning, refrigerant, activity, setup, automations, and admin", async ({ page }) => {
    const vendorName = uniqueTag("Vendor");
    const vendorTrade = uniqueTag("Trade");
    const refrigerantType = uniqueTag("R");
    const tankId = uniqueTag("Tank");

    await loginMobile(page);

    await openWorkspaceFromViews(page, "tab-vendors", "vendors", "vendors-panel");
    await page.getByTestId("vendor-create-name").fill(vendorName);
    await page.getByTestId("vendor-create-trade").fill(vendorTrade);
    await page.getByTestId("vendor-create-submit").click();
    const createdVendor = page.locator(".vendor-row").filter({ hasText: vendorName }).first();
    await expect(createdVendor).toBeVisible();

    const vendorAssignmentItem = page.getByTestId("vendor-assignment-item");
    const hasAssignableItem = await selectFirstRealOption(vendorAssignmentItem);
    if (hasAssignableItem) {
      await page.getByTestId("vendor-assignment-vendor").selectOption({ label: `${vendorName} - ${vendorTrade}` });
      await page.getByTestId("vendor-assignment-create-submit").click();
      await expect(page.locator("[data-testid^='vendor-assignment-']").last()).toBeVisible();
    }
    await assertNoPageHorizontalOverflow(page);

    await openWorkspaceFromViews(page, "tab-planning", "planning", "planning-panel");
    const hasPlanningStaff = await selectFirstRealOption(page.getByTestId("planning-assigned-user"));
    const hasPlanningItem = await selectFirstRealOption(page.getByTestId("planning-item"));
    if (hasPlanningStaff && hasPlanningItem) {
      await page.getByTestId("planning-create-submit").click();
      await expect(page.locator("[data-testid^='planning-block-']").first()).toBeVisible();
    }
    await assertNoPageHorizontalOverflow(page);

    await openModuleRailPanel(page, "module-rail-refrigerant", "refrigerant", "refrigerant-panel");
    await page.getByText("Refrigerant Types", { exact: true }).scrollIntoViewIfNeeded();
    await page.getByPlaceholder("R454B, R32, R410A...").fill(refrigerantType);
    await page.getByRole("button", { name: "Add type" }).click();
    await expect(page.locator(".refrigerant-row").filter({ hasText: refrigerantType }).first()).toBeVisible();
    await page.getByTestId("refrigerant-tab-virgin").click();
    const addTankCard = page.locator(".refrigerant-card").filter({ hasText: "Add Virgin Tank" }).first();
    await addTankCard.locator('input[name="identifier"]').fill(tankId);
    await addTankCard.locator('select[name="refrigerantTypeId"]').selectOption({ label: refrigerantType });
    await addTankCard.locator('input[name="currentWeight"]').fill("28");
    await addTankCard.getByRole("button", { name: "Add tank" }).click();
    await expect(page.locator(".refrigerant-tank-row").filter({ hasText: tankId }).first()).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openWorkspaceFromViews(page, "tab-activity", "activity", "activity-panel");
    await expect(page.getByTestId("activity-table")).toBeVisible();
    await expect(page.getByTestId("daily-manager-report")).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openWorkspaceFromViews(page, "tab-operations", "operations", "operations-panel");
    await expect(page.getByTestId("property-management")).toBeVisible();
    await expect(page.getByTestId("unit-management")).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openWorkspaceFromViews(page, "tab-automations", "automations", "automation-panel");
    await expect(page.getByTestId("automation-template-library")).toBeVisible();
    await expect(page.getByTestId("property-template-library")).toBeVisible();
    await assertNoPageHorizontalOverflow(page);

    await openWorkspaceFromViews(page, "tab-admin", "admin", "admin-panel");
    await expect(page.getByTestId("admin-updates-panel")).toBeVisible();
    await expect(page.getByTestId("admin-user-search")).toBeVisible();
    await assertNoPageHorizontalOverflow(page);
  });
});
