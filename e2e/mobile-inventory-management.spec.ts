import { expect, test } from "@playwright/test";

test("managers can manage reports and directories outside Setup within their property scope", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const admin = await (await page.request.get("/api/auth/me")).json();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers: { "x-csrf-token": admin.csrfToken }, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const stamp = Date.now();
  const { property } = await post("/operations/properties", { code: `IM${stamp}`, name: "Inventory management demo" });
  const { property: other } = await post("/operations/properties", { code: `IO${stamp}`, name: "Other demo property" });
  const username = `inventory-manager-${stamp}`;
  const password = "Test-Only-Manager!123";
  await post("/admin/users", { username, password, fullName: "Inventory Demo Manager", role: "MANAGER", propertyIds: [property.id] });
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  try {
    const login = await context.request.post("/api/auth/login", { data: { identifier: username, password } });
    expect(login.status()).toBe(200);
    const csrf = (await login.json()).csrfToken;
    const manager = await context.newPage();
    await manager.goto("/");
    await manager.getByTestId("mobile-views-toggle").click();
    await expect(manager.getByTestId("nav-group-management").getByTestId("tab-availability")).toBeVisible();
    await manager.getByTestId("tab-availability").click();
    const panel = manager.getByTestId("operations-panel");
    await expect(panel.getByRole("heading", { name: "Availability & Units" })).toBeVisible();
    await expect(panel.getByTestId("property-management")).toHaveCount(0);
    await expect(panel.getByTestId("turn-create-panel")).toHaveCount(0);
    await expect(panel.getByTestId("availability-import-csv")).toBeVisible();
    await expect(panel.getByTestId("unit-import-csv")).toBeHidden();
    await panel.getByTestId("inventory-tab-directory").click();
    await expect(panel.getByTestId("directory-availability-warning")).toContainText("does not overwrite");
    await expect(panel.getByTestId("availability-import-csv")).toBeHidden();
    await panel.getByTestId("unit-import-csv").fill("unit,occupancyStatus,Resident Name\n101,OCCUPIED,Alex Demo");
    manager.once("dialog", dialog => dialog.accept());
    const imported = manager.waitForResponse(response => response.url().endsWith("/operations/units/import") && response.request().method() === "POST");
    await panel.getByTestId("unit-import-submit").click();
    expect((await imported).status()).toBe(200);
    await panel.getByRole("button", { name: "Go to Availability" }).click();
    await panel.getByTestId("availability-import-csv").fill("unit,vacancyStatus,Resident Name,moveOutDate\n101,NTV,Alex Demo,2030-10-01");
    manager.once("dialog", dialog => dialog.accept());
    const available = manager.waitForResponse(response => response.url().endsWith("/operations/availability/import") && response.request().method() === "POST");
    await panel.getByTestId("availability-import-submit").click();
    expect((await available).status()).toBe(200);
    await panel.getByTestId("inventory-tab-mailboxes").click();
    await expect(panel.getByTestId("availability-import-csv")).toBeHidden();
    await expect(panel.getByTestId("mailbox-directory-panel")).toBeVisible();
    await panel.getByTestId("mailbox-directory-panel").locator("summary").first().click();
    await expect(panel.getByTestId("mailbox-import-text")).toBeVisible();
    await panel.getByTestId("inventory-tab-keys").click();
    await expect(panel.getByText("Keys & Access / unit code directory", { exact: true })).toBeVisible();
    await expect(panel.getByTestId("access-codes-panel")).toBeVisible();
    await expect(panel.getByTestId("mailbox-directory-panel")).toBeHidden();
    expect(await manager.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 4)).toBe(true);
    await manager.screenshot({ path: testInfo.outputPath("inventory-mobile.png") });
    await manager.reload();
    await expect(manager.getByRole("heading", { name: "Availability & Units" })).toBeVisible();
    await manager.getByTestId("mobile-views-toggle").click();
    await manager.getByTestId("tab-operations").click();
    await expect(manager.getByTestId("property-management")).toBeVisible();
    await expect(manager.getByTestId("availability-import-csv")).toBeVisible();
    for (const [path, data] of [
      ["units", { propertyId: other.id, units: [{ number: "999" }] }],
      ["availability", { propertyId: other.id, rows: [{ number: "999", vacancyStatus: "NTV" }] }],
    ] as const) {
      const denied = await context.request.post(`/api/operations/${path}/import`, { headers: { "x-csrf-token": csrf }, data });
      expect(denied.status()).toBe(403);
    }
  } finally { await context.close(); }
});
