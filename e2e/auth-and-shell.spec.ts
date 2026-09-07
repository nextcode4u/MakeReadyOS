import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "../apps/web/node_modules/typescript/lib/typescript.js";

const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456";
const techEmail = process.env.DEMO_TECH_EMAIL || "tech@example.com";
const techPassword = process.env.DEMO_TECH_PASSWORD || "MakeReadyTech!23456";

test("connection banner clears after verified recovery but not a failed retry", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let fail = true;
  await page.route("**/api/auth/me?connection-check=*", route => fail ? route.abort("failed") : route.continue());
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("makereadyos:api-unreachable", { detail: { at: new Date().toISOString() } })));
  await expect(page.getByTestId("connection-banner")).toBeVisible();
  await page.getByTestId("connection-retry").click();
  await expect(page.getByTestId("connection-banner")).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(page.getByTestId("connection-banner")).toBeVisible();
  fail = false;
  await expect(page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 20000 });
});

test("property turn splits assign 25/75 and 100 percent independently with safe retries", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const response = await session;
  const origin = new URL(response.url()).origin;
  const { csrfToken } = await response.json();
  const headers = { "x-csrf-token": csrfToken };
  const post = async (path: string, data: unknown) => {
    const result = await page.request.post(`${origin}/api${path}`, { headers, data });
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  };
  const get = async (path: string) => {
    const result = await page.request.get(`${origin}/api${path}`);
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  };
  const stamp = Date.now();
  const { property: ta } = await post("/operations/properties", { code: `SPLITTA${stamp}`, name: "Split TA" });
  const { property: vab } = await post("/operations/properties", { code: `SPVAB${stamp}`, name: "Split VAB" });
  const { user: manager } = await post("/admin/users", { username: `splitmanager${stamp}`, fullName: `Split Manager ${stamp}`, role: "MANAGER", propertyIds: [ta.id, vab.id], password: "Test-Only-Split!123" });
  const { user: tech } = await post("/admin/users", { username: `splittech${stamp}`, fullName: `Split Tech ${stamp}`, role: "TECH", propertyIds: [ta.id], password: "Test-Only-Split!123" });
  const meta = await get("/meta");
  const create = async (propertyId: string, number: string, extra: Record<string, unknown> = {}) => {
    const { unit } = await post("/operations/units", { propertyId, number });
    const section = meta.boardSections.find((entry: any) => entry.propertyId === propertyId && entry.sectionType === "MAKE_READY");
    return post("/make-ready-items", { propertyId, unitId: unit.id, boardGroup: section.key, itemName: number, unitNumber: number, vacatedDate: "2020-01-01", completionStatus: "NO", vacancyStatus: "VACANT NOT LEASED NOT READY", ...extra });
  };
  const taItems = [];
  for (let i = 0; i < 2; i++) taItems.push(await create(ta.id, `TA-${i}`));
  const vabItem = await create(vab.id, "VAB-1");
  const manual = await create(ta.id, "MANUAL", { assignedTech: manager.fullName });
  const ready = await create(ta.id, "READY", { vacancyStatus: "VACANT LEASED READY" });
  const completed = await create(ta.id, "DONE", { completionStatus: "DONE" });
  const archived = await create(ta.id, "ARCHIVED");
  await post("/make-ready-items/batch", { action: "ARCHIVE", ids: [archived.id] });
  const endpoint = (id: string) => `/automations/turn-assignment/${id}`;
  expect((await get(endpoint(vab.id))).staff.some((user: any) => user.id === tech.id)).toBeFalsy();
  const bad = await page.request.put(`${origin}/api${endpoint(vab.id)}`, { headers, data: { enabled: true, shares: [{ userId: tech.id, percent: 100 }] } });
  expect(bad.status()).toBe(409);
  await page.reload();
  await page.getByTestId("tab-automations").click();
  const guide = page.getByTestId("turn-assignment-guide");
  await guide.getByLabel("Assign turns for").selectOption(ta.id);
  await guide.getByLabel("Add person").selectOption(manager.id);
  await guide.getByLabel(`Share for ${manager.fullName}`).fill("25");
  await guide.getByLabel("Add person").selectOption(tech.id);
  await expect(guide.getByLabel(`Share for ${tech.fullName}`)).toHaveValue("75");
  await guide.getByLabel(`Share for ${tech.fullName}`).fill("74");
  await expect(guide.getByRole("button", { name: "Enable split and assign eligible turns" })).toBeDisabled();
  await guide.getByLabel(`Share for ${tech.fullName}`).fill("75");
  await page.setViewportSize({ width: 412, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await guide.getByRole("button", { name: "Enable split and assign eligible turns" }).click();
  await expect(guide.getByRole("status")).toContainText("2 turn(s) assigned");
  const counts = async () => {
    const items = await Promise.all(taItems.map(item => get(`/make-ready-items/${item.id}`)));
    return [items.filter(item => item.assignedTech === manager.fullName).length, items.filter(item => item.assignedTech === tech.fullName).length];
  };
  expect(await counts()).toEqual([1, 1]);
  // Saving identical shares must keep the nonzero balance from this partial cycle.
  const resave = await page.request.put(`${origin}/api${endpoint(ta.id)}`, { headers, data: { enabled: true, shares: [{ userId: tech.id, percent: 75 }, { userId: manager.id, percent: 25 }] } });
  expect(resave.ok(), await resave.text()).toBeTruthy();
  for (let i = 2; i < 4; i++) taItems.push(await create(ta.id, `TA-${i}`));
  expect((await post(`${endpoint(ta.id)}/run`, {})).assigned).toBe(2);
  expect(await counts()).toEqual([1, 3]);
  await guide.getByLabel("Assign turns for").selectOption(vab.id);
  await guide.getByLabel("Add person").selectOption(manager.id);
  await guide.getByRole("button", { name: "Enable split and assign eligible turns" }).click();
  await expect(guide.getByRole("status")).toContainText("1 turn(s) assigned");
  expect((await get(`/make-ready-items/${vabItem.id}`)).assignedTech).toBe(manager.fullName);
  for (const item of [ready, completed, archived]) expect((await get(`/make-ready-items/${item.id}`)).assignedTech).toBeNull();
  expect((await get(`/make-ready-items/${manual.id}`)).assignedTech).toBe(manager.fullName);
  for (let i = 4; i < 8; i++) taItems.push(await create(ta.id, `TA-${i}`));
  const runs = await Promise.all(Array.from({ length: 3 }, () => post(`${endpoint(ta.id)}/run`, {})));
  expect(runs.reduce((sum, run) => sum + run.assigned, 0)).toBe(4);
  expect(await counts()).toEqual([2, 6]);
  await guide.getByRole("button", { name: "Pause automatic assignment" }).click();
  await expect(guide.getByRole("status")).toContainText("paused");
  await create(vab.id, "VAB-PAUSED");
  expect((await post(`${endpoint(vab.id)}/run`, {})).assigned).toBe(0);
  // Revoked TA access must block the whole split, not silently give its share to the manager.
  const revoke = await page.request.put(`${origin}/api/admin/users/${tech.id}/property-access`, { headers, data: { propertyIds: [] } });
  expect(revoke.ok(), await revoke.text()).toBeTruthy();
  await create(ta.id, "TA-BLOCKED");
  const blocked = await post(`${endpoint(ta.id)}/run`, {});
  expect(blocked.assigned).toBe(0);
  expect(blocked.warning).toContain("no longer has assignment access");
  await post("/auth/login", { identifier: manager.username, password: "Test-Only-Split!123" });
  const notices = (await get("/notifications")).notifications.filter((notice: any) => notice.dedupeKey?.startsWith("turn-split:"));
  expect(notices).toHaveLength(3);
  expect(notices.filter((notice: any) => notice.propertyId === ta.id)).toHaveLength(2);
  expect(notices.filter((notice: any) => notice.propertyId === vab.id)).toHaveLength(1);
});

test("guided weekday scheduling populates all five calendar tracks without duplicate rules or overwritten dates", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const response = await session;
  const origin = new URL(response.url()).origin;
  const { csrfToken } = await response.json();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, { headers: { "x-csrf-token": csrfToken }, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const { property } = await post("/operations/properties", { code: `QATURN${Date.now()}`, name: "Weekday Turn Test" });
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "TURN-101" });
  const meta = await (await page.request.get(`${origin}/api/meta`)).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, vacatedDate: "2026-09-04", completionStatus: "NO" });
  const skipped: string[] = [];
  for (const status of ["DONE", "ARCHIVED"]) {
    const { unit: other } = await post("/operations/units", { propertyId: property.id, number: `TURN-${status}` });
    const skip = await post("/make-ready-items", { propertyId: property.id, unitId: other.id, boardGroup: section.key, itemName: other.number, unitNumber: other.number, vacatedDate: "2026-09-04", completionStatus: status === "DONE" ? "DONE" : "NO" });
    skipped.push(skip.id);
    if (status === "ARCHIVED") await post("/make-ready-items/batch", { action: "ARCHIVE", ids: [skip.id] });
  }
  await page.reload();
  await page.getByTestId("tab-automations").click();
  await expect(page.getByTestId("turn-scheduling-guide")).toBeVisible();
  await expect(page.getByTestId("automation-template-library")).not.toBeVisible();
  await page.getByTestId("turn-setup-property").selectOption(property.id);
  await page.getByTestId("turn-setup-preview").click();
  await expect(page.getByTestId("turn-scheduling-guide")).toContainText("5 missing dates");
  await page.getByText("Review proposed dates (1 of 1 units)").click();
  await expect(page.getByTestId("turn-scheduling-guide")).toContainText("2026-09-11");
  await page.setViewportSize({ width: 412, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.route("**/api/automations/turn-setup/enable", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Setup temporarily unavailable" }) }));
  await page.getByTestId("turn-setup-enable").click();
  await expect(page.getByTestId("turn-scheduling-guide").getByRole("alert")).toContainText("Setup temporarily unavailable");
  await expect(page.getByTestId("turn-setup-property")).toHaveValue(property.id);
  await page.unroute("**/api/automations/turn-setup/enable");
  await page.getByTestId("turn-setup-enable").click();
  await expect(page.getByTestId("turn-scheduling-guide").getByRole("status")).toContainText("5 missing calendar dates filled");
  const repeats = await Promise.all(Array.from({ length: 3 }, () => post("/automations/turn-setup/enable", { propertyId: property.id, days: [1, 1, 1, 1, 1] })));
  expect(new Set(repeats.flatMap(result => result.rules.map((rule: any) => rule.id))).size).toBe(5);
  for (const rule of repeats[0].rules) {
    const { execution } = await post(`/automations/${rule.id}/run`, {});
    expect(execution.actionCount).toBe(0);
  }
  const saved = await (await page.request.get(`${origin}/api/make-ready-items/${item.id}`)).json();
  expect(saved.makeReadyDate).toContain("2026-09-11");
  expect(saved.flooringDate).toContain("2026-09-10");
  for (const id of skipped) {
    const skippedItem = await (await page.request.get(`${origin}/api/make-ready-items/${id}`)).json();
    expect(skippedItem.makeReadyDate).toBeNull();
    expect(skippedItem.flooringDate).toBeNull();
  }
  const refreshed = await (await page.request.get(`${origin}/api/meta`)).json();
  for (const fieldKey of ["turnMaintenanceDate", "turnPaintingDate", "turnCleaningDate"]) {
    const field = refreshed.customFields.find((field: any) => field.fieldKey === fieldKey);
    expect(field).toBeTruthy();
    expect(refreshed.scheduleTracks.some((track: any) => track.sourceField === `custom:${field.id}` && track.isEnabled)).toBeTruthy();
  }
  await page.getByRole("button", { name: "Open Schedule calendar" }).click();
  await expect(page.getByTestId("calendar-view")).toBeVisible();
  await expect(page.locator(".calendar-panel")).toHaveCount(5);
  await post("/automations/turn-setup/pause", { propertyId: property.id });
  const paused = await post("/automations/turn-setup/preview", { propertyId: property.id });
  expect(paused.configured).toBe(0);
  expect(paused.changes).toBe(0);
});

test("partial mobile pool logs never default unchecked safety to pass", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("module-rail-pool").click();
  await page.getByRole("combobox", { name: "Pool log property" }).selectOption("");
  await page.getByTestId("pool-tab-setup").click();
  await expect(page.getByTestId("pool-property-required")).toBeVisible();
  await expect(page.getByTestId("pool-facility-submit")).toBeDisabled();
  await page.getByTestId("pool-tab-chemicals").click();
  await expect(page.getByTestId("pool-chemical-submit")).toBeDisabled();
  await page.getByTestId("pool-tab-daily").click();
  await expect(page.getByTestId("pool-daily-submit")).toBeDisabled();
  await page.getByRole("combobox", { name: "Pool log property" }).selectOption({ index: 1 });
  await page.getByTestId("pool-tab-setup").click();
  await page.getByTestId("pool-facility-name").fill(uniqueTag("Partial Pool"));
  const facility = page.waitForResponse(response => response.url().includes("/api/pool/facilities") && response.request().method() === "POST");
  await page.getByTestId("pool-facility-submit").click();
  expect((await facility).status()).toBe(201);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("pool-tab-daily").click();
  await expect(page.getByTestId("pool-safety-0")).toHaveValue("NOT_CHECKED");
  const saved = page.waitForResponse(response => response.url().includes("/api/pool/entries") && response.request().method() === "POST");
  await page.getByTestId("pool-daily-submit").click();
  const result = await saved;
  expect(result.status()).toBe(201);
  const body = await result.json();
  expect(body.entry.evaluationJson.status).toBe("INCOMPLETE");
  expect(body.entry.safetyChecks.every((check: { value: string }) => check.value === "NOT_CHECKED")).toBe(true);
  await page.getByTestId("pool-tab-history").click();
  await expect(page.getByTestId("pool-history-row").first()).toContainText("INCOMPLETE");
  await expect(page.getByTestId("pool-history-row").first()).toContainText("Record missing readings and checks");
});

test("admin can resend an invite and sees delivery failures inline", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-admin").click();
  await page.getByTestId("admin-user-search").fill(adminEmail);
  await page.locator(".admin-user-table tbody tr").first().click();
  const resend = page.getByTestId("admin-resend-invite");
  await expect(resend).toBeEnabled();
  await page.getByTestId("admin-edit-email").fill("unsaved@example.com");
  await expect(resend).toBeDisabled();
  await page.getByTestId("admin-edit-email").fill(adminEmail);
  let fail = true;
  await page.route("**/api/admin/users/*/resend-invite", route => route.fulfill({
    status: fail ? 502 : 200, json: fail ? { message: "Test email delivery failure" } : { ok: true },
  }));
  await resend.click();
  await expect(page.getByRole("alert")).toContainText("Test email delivery failure");
  await expect(resend).toBeEnabled();
  fail = false;
  await resend.click();
  await expect(page.getByRole("status").filter({ hasText: "Invite sent." })).toBeVisible();
});

test("invite mode clears and disables the manual password", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-admin").click();
  const password = page.getByTestId("admin-create-password");
  const invite = page.getByTestId("admin-create-send-invite");
  const submit = page.getByTestId("admin-create-user-button");
  await page.getByTestId("admin-create-full-name").fill("Invite Test");
  await page.getByTestId("admin-create-username").fill("invite-test");
  await page.getByTestId("admin-create-email").fill("invite-test@example.com");
  await password.fill("TempUser!23456");
  await invite.check();
  await expect(password).toBeDisabled();
  await expect(password).toHaveValue("");
  await expect(submit).toBeEnabled();
  await invite.uncheck();
  await expect(password).toBeEnabled();
  await expect(password).toHaveValue("");
  await expect(submit).toBeDisabled();
  await password.fill("AnotherTemp!23456");
  await invite.check();
  await page.route("**/api/admin/users", async route => {
    if (route.request().method() !== "POST") return route.continue();
    expect(route.request().postDataJSON()).toMatchObject({ sendInviteEmail: true, password: "" });
    await route.fulfill({ status: 400, json: { message: "Test submission intercepted; no invite sent." } });
  });
  await submit.click();
  await expect(page.getByTestId("admin-panel").getByRole("alert")).toContainText("Test submission intercepted");
  await expect(password).toBeDisabled();
  await expect(password).toHaveValue("");
  await page.getByTestId("admin-create-email").fill("");
  await expect(invite).not.toBeChecked();
  await expect(password).toBeEnabled();
  await expect(submit).toBeDisabled();
});

test("email username checkbox preserves failed account drafts and creates a working login", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-admin").click();
  await page.setViewportSize({ width: 412, height: 915 });
  const email = `${uniqueTag("email-login")}+leasing@example.com`;
  const username = page.getByTestId("admin-create-username");
  await username.fill("manual-name");
  await page.getByTestId("admin-use-email-as-username").check();
  await expect(page.getByTestId("admin-create-user-button")).toBeDisabled();
  await page.getByTestId("admin-create-email").fill("temporary@example.com");
  await expect(username).toHaveValue("temporary@example.com");
  await page.getByTestId("admin-use-email-as-username").uncheck();
  await expect(username).toHaveValue("manual-name");
  await page.getByTestId("admin-use-email-as-username").check();
  await page.getByTestId("admin-create-email").fill(email);
  await expect(username).toHaveValue(email);
  await expect(username).toHaveAttribute("readonly", "");
  await page.getByTestId("admin-create-full-name").fill("Email Username Test");
  await page.getByTestId("admin-create-password").fill("TempUser!23456");
  await page.getByTestId("admin-create-role").selectOption("VIEWER");
  await page.route("**/api/admin/users", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 409, json: { message: "That login is unavailable. Try again." } });
  });
  await page.getByTestId("admin-create-user-button").click();
  await expect(page.getByTestId("admin-panel").getByRole("alert")).toContainText("That login is unavailable.");
  await expect(username).toHaveValue(email);
  await expect(page.getByTestId("admin-create-password")).toHaveValue("TempUser!23456");
  await expect(page.getByText("Startup error", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/admin/users");
  const saved = page.waitForResponse(response => response.url().endsWith("/api/admin/users") && response.request().method() === "POST");
  await page.getByTestId("admin-create-user-button").click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByTestId("admin-create-email")).toHaveValue("");
  await page.getByTestId("mobile-tools-toggle").click();
  await page.getByTestId("account-menu").click();
  await page.getByTestId("logout-button").click();
  await expect(page.getByTestId("login-email")).toBeVisible();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill("TempUser!23456");
  const signedIn = page.waitForResponse(response => response.url().endsWith("/api/auth/login"));
  await page.getByTestId("login-submit").click();
  expect((await signedIn).status()).toBe(200);
  await page.getByTestId("mobile-tools-toggle").click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
});

test("mobile header stays compact and keeps navigation and account tools accessible", async ({ page }, testInfo) => {
  await login(page, adminEmail, adminPassword);
  for (const width of [320, 390, 540, 820]) {
    await page.setViewportSize({ width, height: 915 });
    const header = page.locator(".mobile-filterbar");
    await expect(header).toBeVisible();
    await expect(page.getByTestId("onboarding-open")).toHaveCount(0);
    await expect(page.getByTestId("account-menu")).toHaveCount(0);
    const size = await header.boundingBox();
    expect(size!.height).toBeLessThan(140);
    expect(size!.width).toBeLessThanOrEqual(width);
    await expect(page.getByTestId("board-search")).toBeVisible();
    await page.getByTestId("mobile-tools-toggle").click();
    await page.getByTestId("account-menu").click();
    await expect(page.getByTestId("logout-button")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("mobile-views-toggle").click();
    await expect(page.getByTestId("mobile-tools-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("tab-table").click();
    await expect(page.getByTestId("mobile-views-toggle")).toHaveAttribute("aria-expanded", "false");
    if (width === 390) await page.screenshot({ path: testInfo.outputPath("compact-mobile-header.png") });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByTestId("onboarding-open")).toBeVisible();
});

for (const [tab, endpoint, empty, responseKey] of [
  ["Calendar", "calendar", "No tasks scheduled in this range.", "tasks"],
  ["Tasks", "tasks", "No PM tasks found", "tasks"],
  ["Templates", "templates", "No PM templates created yet.", "templates"],
  ["History", "history", "No PM history found.", "tasks"],
]) {
  test(`PM ${tab} failures show retry instead of empty records`, async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    let fail = true;
    await page.route(`**/api/pm/${endpoint}?**`, async route => {
      await route.fulfill(fail
        ? { status: 503, json: { message: "Temporary PM outage" } }
        : { json: { [responseKey]: [] } });
    });
    await page.getByTestId("module-rail-pm").click();
    await page.setViewportSize({ width: 412, height: 915 });
    const panel = page.getByTestId("preventive-maintenance-panel");
    await panel.locator(".module-tabs").getByRole("button", { name: tab, exact: true }).click();
    await expect(panel.getByText(empty, { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("alert")).toContainText("PM records could not be loaded.");
    await expect(panel.getByText(empty, { exact: true })).toHaveCount(0);
    fail = false;
    await panel.getByRole("button", { name: "Retry records", exact: true }).click();
    await expect(panel.getByText(empty, { exact: true })).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
  });
}

test("project list failures show retry instead of a false empty state", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let fail = true;
  await page.route("**/api/projects/records?**", async route => {
    await route.fulfill(fail
      ? { status: 503, json: { message: "Temporary project outage" } }
      : { json: { records: [] } });
  });
  await page.getByTestId("module-rail-projects").click();
  await page.locator(".projects-panel .module-tabs").getByRole("button", { name: "Projects", exact: true }).click();
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(page.getByText("No records match this view yet.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Project records could not be loaded" })).toBeVisible();
  await expect(page.getByText("No records match this view yet.", { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Retry records", exact: true }).click();
  await expect(page.getByText("No records match this view yet.", { exact: true })).toBeVisible();
});

test("pool history failures are not presented as empty records and can be retried", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let fail = true;
  await page.route("**/api/pool/entries**", async route => {
    await route.fulfill(fail
      ? { status: 503, json: { message: "Temporary history outage" } }
      : { json: { entries: [], pagination: { total: 0, hasMore: false } } });
  });
  await page.getByTestId("module-rail-pool").click();
  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByTestId("pool-tab-history").click();
  await expect(page.getByText("No pool log entries found.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Pool history could not be loaded" })).toBeVisible();
  await expect(page.getByText("No pool log entries found.", { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Retry history", exact: true }).click();
  await expect(page.getByText("No pool log entries found.", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Pool history could not be loaded" })).toHaveCount(0);
});

test("common-area quick capture checks later pages independently of the active list", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const offsets: number[] = [];
  let switchedAccount = false;
  let releaseLookup!: () => void;
  const pendingLookup = new Promise<void>(resolve => { releaseLookup = resolve; });
  await page.route("**/api/lease-compliance/issues?**", async route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset"));
    if (params.get("commonAreasOnly") !== "true") {
      await route.fulfill({ json: { issues: [], pagination: { total: 0, hasMore: false } } });
      return;
    }
    if (switchedAccount) {
      await pendingLookup;
      await route.fulfill({ json: { issues: [], pagination: { total: 0, hasMore: false } } });
      return;
    }
    offsets.push(offset);
    const issue = {
      id: `common-${offset}`, propertyId: params.get("propertyId"), unitId: null,
      building: "Clubhouse", area: "Pool", issueTypeName: offset ? "QA Gate" : "QA Deck",
      status: "Open", isArchived: false, priority: "Normal", noticeStage: "None",
      createdAt: "2026-09-06T12:00:00Z", updatedAt: "2026-09-06T12:00:00Z",
      photos: [], notes: [], persistenceChecks: [], noticeActions: [], tags: [],
    };
    await route.fulfill({ json: { issues: [issue], pagination: { total: 2, offset, limit: 1, hasMore: offset === 0 } } });
  });
  await page.getByTestId("module-rail-lease-compliance").click();
  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByTestId("lease-quick-capture-building").fill("Clubhouse");
  await page.getByTestId("lease-quick-capture-area").fill("Pool");
  await expect(page.getByTestId("lease-repeat-card")).toHaveCount(2);
  await expect(page.getByTestId("lease-repeat-card").filter({ hasText: "QA Gate" })).toBeVisible();
  expect(offsets).toEqual([0, 1]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId("account-menu").click();
  await page.getByTestId("logout-button").click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  switchedAccount = true;
  await page.getByTestId("login-email").fill(techEmail);
  await page.getByTestId("login-password").fill(techPassword);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  await page.getByTestId("module-rail-lease-compliance").click();
  await page.getByTestId("lease-quick-capture-building").fill("Clubhouse");
  await page.getByTestId("lease-quick-capture-area").fill("Pool");
  await expect(page.getByText("Checking this location's existing issues...", { exact: true })).toBeVisible();
  await expect(page.getByTestId("lease-repeat-card")).toHaveCount(0);
  releaseLookup();
  await expect(page.getByText("Checking this location's existing issues...", { exact: true })).toHaveCount(0);
});

test("lease quick capture checks every page for the selected unit independently of list filters", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const sessionResponse = await session;
  const origin = new URL(sessionResponse.url()).origin;
  const { csrfToken } = await sessionResponse.json();
  const unitsResponse = await page.request.get(`${origin}/api/operations/units`);
  expect(unitsResponse.ok()).toBeTruthy();
  const { units } = await unitsResponse.json();
  const unit = units.find((entry: { number: string; property: { code: string } }) => /^(?:TA )?284$/.test(entry.number) && entry.property.code === "TA");
  expect(unit).toBeTruthy();
  const ids: string[] = [];
  for (const issueTypeName of ["QA Blinds", "QA Patio"]) {
    const response = await page.request.post(`${origin}/api/lease-compliance/issues`, {
      headers: { "x-csrf-token": csrfToken },
      data: { propertyId: unit.propertyId, unitId: unit.id, issueTypeName, description: "QA independent unit lookup" },
    });
    expect(response.status(), await response.text()).toBe(201);
    ids.push((await response.json()).issue.id);
  }
  const existing = await page.request.get(`${origin}/api/lease-compliance/issues?unitId=${unit.id}`);
  const fixtures = (await existing.json()).issues.filter((issue: { id: string }) => ids.includes(issue.id));
  const offsets: number[] = [];
  await page.route("**/api/lease-compliance/issues?**", async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("unitId") === unit.id) {
      expect(params.has("q")).toBe(false);
      expect(params.has("status")).toBe(false);
      const offset = Number(params.get("offset"));
      offsets.push(offset);
      await route.fulfill({ json: { issues: fixtures.slice(offset, offset + 1), pagination: { total: 2, offset, limit: 1, hasMore: offset === 0 } } });
    } else {
      await route.fulfill({ json: { issues: [], pagination: { total: 0, offset: 0, limit: 200, hasMore: false } } });
    }
  });
  await page.getByTestId("module-rail-lease-compliance").click();
  await page.getByTestId("lease-compliance-panel").getByRole("combobox", { name: "Lease Compliance property", exact: true }).selectOption(unit.propertyId);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByPlaceholder("Search unit...", { exact: true }).fill("284");
  await page.getByRole("listbox").getByRole("button", { name: /^(?:TA )?284(?: \/|$)/ }).click();
  await expect(page.getByTestId("lease-repeat-card")).toHaveCount(2);
  await expect(page.getByTestId("lease-repeat-card").filter({ hasText: "QA Patio" })).toBeVisible();
  await expect(page.getByTestId("lease-repeat-card").filter({ hasText: "QA Blinds" })).toBeVisible();
  expect(offsets).toEqual([0, 1]);
  const resolvedId = fixtures.find((issue: { issueTypeName: string }) => issue.issueTypeName === "QA Blinds").id;
  await page.route(`**/api/lease-compliance/issues/${resolvedId}/resolve`, async route => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    fixtures.find((issue: { id: string }) => issue.id === resolvedId).status = "Resolved";
    await route.fulfill({ response });
  });
  await page.getByTestId("lease-repeat-card").filter({ hasText: "QA Blinds" }).getByRole("button", { name: "Mark Resolved", exact: true }).click();
  await expect(page.getByTestId("lease-repeat-card")).toHaveCount(1);
  await expect(page.getByTestId("lease-repeat-card")).toContainText("QA Patio");
});

test("rejected login stays inline, preserves inputs, and permits a successful retry", async ({ page }) => {
  await page.goto("/");
  let attempts = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/login", async route => {
    attempts++;
    if (attempts === 1) {
      await pending;
      await route.fulfill({ status: 401, json: { message: "Invalid credentials" } });
    } else await route.continue();
  });
  await page.getByTestId("login-email").fill(adminEmail);
  await page.getByTestId("login-password").fill("wrong-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-submit")).toBeDisabled();
  await page.locator(".login-form").dispatchEvent("submit");
  await expect.poll(() => attempts).toBe(1);
  release();
  await expect(page.locator(".login-form").getByRole("alert")).toHaveText("Invalid credentials");
  await expect(page.getByTestId("login-password")).toHaveValue("wrong-password");
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
  await page.getByTestId("login-password").fill(adminPassword);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("board-table-view")).toBeVisible();
  expect(attempts).toBe(2);
});

test("dashboard survives delayed analytics loading", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/analytics/summary**", async route => {
    await pending;
    await route.continue();
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByTestId("tab-dashboard").click();
  await expect(page.getByTestId("analytics-panel")).toContainText("Loading snapshot-backed analytics");
  release();
  await expect(page.getByTestId("analytics-panel")).not.toContainText("Loading snapshot-backed analytics");
  await expect(page.getByTestId("dashboard-panel")).toBeVisible();
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("failed bulk archive keeps its selection and blocks duplicate confirmation", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/make-ready-items/batch", async route => {
    expect(route.request().postDataJSON().ids).toHaveLength(1);
    requests++;
    await pending;
    await route.fulfill({ status: 503, json: { message: "Test archive unavailable" } });
  });
  await page.getByTestId("select-item-ta-284").check();
  await page.getByTestId("batch-archive").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("TA / TA 284");
  const another = page.locator('input[data-testid^="select-item-"]:not([data-testid="select-item-ta-284"])').first();
  await another.evaluate(element => (element as HTMLInputElement).click());
  await expect(page.getByTestId("confirm-dialog")).toContainText("archive 1 selected");
  const confirm = page.getByTestId("confirm-dialog-confirm");
  await confirm.click();
  await expect(confirm).toBeDisabled();
  await confirm.evaluate(element => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(page.getByTestId("confirm-dialog").getByRole("alert")).toHaveText("Test archive unavailable");
  await expect(confirm).toBeEnabled();
  await expect(page.getByTestId("select-item-ta-284")).toBeChecked();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByTestId("board-search").fill("no-such-unit-for-selection-test");
  await expect(page.getByTestId("batch-action-bar")).toHaveCount(0);
  await page.getByTestId("board-search").fill("");
  await expect(page.getByTestId("select-item-ta-284")).not.toBeChecked();
  expect(requests).toBe(1);
});

test("move confirmation preserves its original unit selection after a failed request", async ({ page }) => {
  const loaded = page.waitForResponse(response => response.url().includes("/api/make-ready-items") && response.request().method() === "GET" && response.ok());
  await login(page, adminEmail, adminPassword);
  const response = await loaded;
  const body = await response.json();
  const selectedItem = (Array.isArray(body) ? body : body.items).find((item: { unitNumber: string }) => item.unitNumber === "TA 284");
  expect(selectedItem).toBeTruthy();
  await page.getByTestId("select-item-ta-284").check();
  const groups = page.getByTestId("batch-group-select");
  await groups.selectOption({ index: 1 });
  const destination = await groups.inputValue();
  await page.getByTestId("batch-move").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText("TA / TA 284");
  await page.locator('input[data-testid^="select-item-"]:not([data-testid="select-item-ta-284"])').first()
    .evaluate(element => (element as HTMLInputElement).click());
  await expect(dialog).toContainText("Move 1 selected items");
  const submitted: unknown[] = [];
  await page.route("**/api/make-ready-items/batch", async route => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, json: { message: "Test move unavailable" } });
  });
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect(dialog.getByRole("alert")).toHaveText("Test move unavailable");
  expect(submitted).toEqual([{ action: "MOVE_GROUP", ids: [selectedItem.id], boardGroup: destination }]);
  await expect(page.getByTestId("select-item-ta-284")).toBeChecked();
});

test("literal translation keys have user-facing labels", () => {
  const source = readFileSync("apps/web/src/lib/i18n.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const dictionary: { t?: (language: string, key: string) => string } = {};
  new Function("exports", compiled)(dictionary);
  const missing: string[] = [];
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.tsx?$/.test(entry.name)) {
        const ast = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        function visit(node: ts.Node) {
          if (ts.isCallExpression(node) && ["t", "tWithVars"].includes(node.expression.getText(ast))) {
            for (const argument of node.arguments.slice(0, 2)) {
              if (ts.isStringLiteral(argument) && argument.text.includes(".")) {
                for (const language of ["en", "es"]) {
                  if (dictionary.t!(language, argument.text) === argument.text) missing.push(`${path}: ${language} ${argument.text}`);
                }
              }
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(ast);
      }
    }
  }
  inspect("apps/web/src");
  expect(missing).toEqual([]);
});

test("concurrent lease setup requests initialize defaults without duplicates", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const sessionResponse = await session;
  const origin = new URL(sessionResponse.url()).origin;
  const { csrfToken } = await sessionResponse.json();
  const created = await page.request.post(`${origin}/api/operations/properties`, {
    headers: { "x-csrf-token": csrfToken }, data: { code: `QALC${Date.now()}`, name: "QA Lease Defaults" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { property } = await created.json();
  const responses = await Promise.all(Array.from({ length: 10 }, () => page.request.get(`${origin}/api/lease-compliance/issue-types?propertyId=${property.id}`)));
  let expectedNames: string[] | undefined;
  for (const response of responses) {
    expect(response.status(), await response.text()).toBe(200);
    const { issueTypes } = await response.json();
    const names = issueTypes.map((entry: { name: string }) => entry.name).sort();
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    if (expectedNames) expect(names).toEqual(expectedNames);
    expectedNames = names;
  }
});

test("pest and lease setup forms reset safely after asynchronous saves", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/pest/issues", route => route.request().method() === "POST" ? route.fulfill({ status: 201, json: { issue: { id: "test-issue" } } }) : route.continue());
  await page.route("**/api/pest/vendors", route => route.request().method() === "POST" ? route.fulfill({ status: 201, json: { vendor: { id: "test-vendor" } } }) : route.continue());
  await page.getByTestId("module-rail-pest").click();
  await page.setViewportSize({ width: 412, height: 915 });
  await page.getByTestId("pest-quick-add-area").fill("Test courtyard");
  await page.getByTestId("pest-quick-add-description").fill("Test ants");
  await page.getByTestId("pest-quick-add-submit").click();
  await expect(page.getByTestId("pest-quick-add-description")).toHaveValue("");
  await page.locator(".module-tabs").getByRole("button", { name: "Vendors", exact: true }).click();
  const vendorName = page.locator('input[name="vendorName"]');
  await vendorName.fill("Test vendor");
  await page.locator("form").filter({ has: vendorName }).getByRole("button", { name: "Add Vendor", exact: true }).click();
  await expect(vendorName).toHaveValue("");
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("module-rail-lease-compliance").click();
  await page.locator(".module-tabs").getByRole("button", { name: "Setup", exact: true }).click();
  let saveSucceeds = false;
  await page.route("**/api/lease-compliance/issue-types", route => route.request().method() === "POST"
    ? route.fulfill({ status: saveSucceeds ? 201 : 400, json: saveSucceeds ? { issueType: { id: "test-type" } } : { message: "Test validation error" } })
    : route.continue());
  const name = page.locator('input[name="name"]');
  const form = page.locator("form").filter({ has: name });
  await name.fill("Test issue type");
  await form.getByRole("button", { name: "Add Issue Type", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Test validation error");
  await expect(name).toHaveValue("Test issue type");
  saveSucceeds = true;
  await form.getByRole("button", { name: "Add Issue Type", exact: true }).click();
  await expect(name).toHaveValue("");
  expect(errors).toEqual([]);
});

test("runtime errors preserve drafts, escape details, and allow dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.setContent('<div id="root"><input aria-label="Draft" value="Keep this draft"></div>');
  const compiled = ts.transpileModule(readFileSync("apps/web/src/lib/appErrors.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await page.addScriptTag({ content: `(function(){const exports={};${compiled}\nexports.installAppErrorHandlers();})();` });
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { message: '<img src=x onerror="window.injected=true">' })));
  await expect(page.getByLabel("Draft")).toHaveValue("Keep this draft");
  await page.getByText("Error details", { exact: true }).click();
  await expect(page.locator("#app-error-notice pre")).toContainText("<img");
  await expect(page.locator("#app-error-notice img")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: "Second failure" })));
  await expect(page.locator("#app-error-notice")).toHaveCount(1);
  await expect(page.getByLabel("Draft")).toHaveValue("Keep this draft");
  await page.getByText("Error details", { exact: true }).click();
  await expect(page.locator("#app-error-notice pre")).toHaveText("Second failure");
  await assertNoPageHorizontalOverflow(page);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Reload app" }).click();
  await expect(page.getByLabel("Draft")).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("refrigerant failed saves retain drafts and failed history is not empty", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let saveSucceeds = false;
  let historySucceeds = false;
  await page.route("**/api/refrigerant/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/overview")) return route.fulfill({ json: { types: [], summary: {}, recent: [] } });
    if (path.endsWith("/cylinders")) return route.fulfill({ json: { cylinders: [] } });
    if (path.endsWith("/history")) return route.fulfill({ status: historySucceeds ? 200 : 503, json: historySucceeds ? { transactions: [] } : { message: "History unavailable" } });
    if (path.endsWith("/types") && route.request().method() === "POST") {
      return route.fulfill({ status: saveSucceeds ? 200 : 400, json: saveSucceeds ? {} : { message: "Rejected test save" } });
    }
    return route.abort();
  });
  await page.getByTestId("module-rail-refrigerant").click();
  const name = page.locator('input[name="name"]');
  const chargeDraft = page.locator("form").filter({ has: page.locator('select[name="sourceCylinderId"]') }).locator('input[name="notes"]');
  await chargeDraft.fill("Unsubmitted charge notes");
  const form = page.locator("form").filter({ has: name });
  await name.fill("R32 test");
  await form.locator('input[name="notes"]').fill("Keep my draft");
  await form.locator('button[type="submit"]').click();
  await expect(page.getByText("Rejected test save")).toBeVisible();
  await expect(name).toHaveValue("R32 test");
  await expect(form.locator('input[name="notes"]')).toHaveValue("Keep my draft");
  saveSucceeds = true;
  await form.locator('button[type="submit"]').click();
  await expect(name).toHaveValue("");
  await expect(chargeDraft).toHaveValue("Unsubmitted charge notes");
  await page.getByTestId("refrigerant-tab-history").click();
  await expect(page.getByRole("alert")).toContainText("Could not refresh history", { timeout: 15000 });
  await expect(page.getByText("No refrigerant activity logged yet.")).toHaveCount(0);
  historySucceeds = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("No refrigerant activity logged yet.")).toBeVisible();
});

test("light theme uses neutral surfaces and preserves the warm eye-strain option", async ({ page }, testInfo) => {
  await page.setContent(`<html data-theme="light"><body><div class="app-shell compact-mode">
    <header class="filterbar"><strong>MakeReadyOS</strong><button class="button button-primary">Table</button><button class="button button-secondary">Schedule</button><select aria-label="Property"><option>All properties</option></select></header>
    <main style="padding:16px"><section class="primary-panel"><div class="board-group-title">TA / READY UNITS</div>
    <div class="table-wrap"><table class="board-table"><thead><tr><th>Item</th><th>Floor plan</th><th>Vacancy</th><th>Assigned</th></tr></thead><tbody><tr><td>012</td><td><button class="cell-button">B1</button></td><td><span class="status-pill status-active">Vacant leased ready</span></td><td>Unassigned</td></tr></tbody></table></div>
    <div class="calendar-day past">Previous day</div><button class="button" disabled>Unavailable</button></section></main>
    </div></body></html>`);
  await page.addStyleTag({ content: readFileSync("apps/web/src/styles/app.css", "utf8") });
  await expect(page.locator(".primary-panel")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".filterbar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByLabel("Property")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".board-table th").first()).toHaveCSS("background-color", "rgb(232, 238, 245)");
  await expect(page.locator(".cell-button")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".calendar-day")).toHaveCSS("background-color", "rgb(237, 242, 247)");
  await expect(page.getByRole("button", { name: "Unavailable" })).toHaveCSS("background-color", "rgb(237, 242, 247)");
  await expect(page.locator(".status-active")).toHaveCSS("background-color", "rgb(210, 242, 224)");
  await page.screenshot({ path: testInfo.outputPath("neutral-light-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 412, height: 915 });
  await assertNoPageHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("neutral-light-mobile.png"), fullPage: true });
  await page.locator("html").evaluate((element) => element.classList.add("eye-strain-mode"));
  await expect(page.locator(".primary-panel")).toHaveCSS("background-color", "rgb(255, 253, 248)");
  await page.locator("html").evaluate((element) => { element.classList.remove("eye-strain-mode"); element.setAttribute("data-theme", "dark"); });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
});

for (const width of [375, 1440]) {
  test(`password recovery screens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    let resets = 0;
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/reset-password")) {
        resets++;
        expect(route.request().postDataJSON().token).toBe("a".repeat(64));
        return route.fulfill({ json: { ok: true } });
      }
      if (url.endsWith("/auth/forgot-password")) return route.fulfill({ json: { message: "If an active account matches, a link will be sent." } });
      return route.fulfill({ status: 401, json: { message: "Not authenticated" } });
    });
    await page.goto(`/#password-reset=${"a".repeat(64)}`);
    await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
    await expect(page).not.toHaveURL(/password-reset=/);
    await page.getByLabel("New password", { exact: true }).fill("New-Password!123");
    await page.getByLabel("Confirm password", { exact: true }).fill("Different-Password!123");
    await page.getByRole("button", { name: "Save password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("do not match");
    expect(resets).toBe(0);
    await page.getByLabel("Confirm password", { exact: true }).fill("New-Password!123");
    await page.getByRole("button", { name: "Save password", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Password saved");
    expect(resets).toBe(1);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByLabel("Account email").fill("test@example.com");
    await page.getByRole("button", { name: "Send password link" }).click();
    await expect(page.getByRole("status")).toContainText("If an active account");
    await assertNoPageHorizontalOverflow(page);
  });
}

function slugify(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

function uniqueTag(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function customFieldKey(label: string) {
  const parts = label.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  const first = (parts.shift() ?? "field").toLowerCase();
  return `${first}${parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`).join("")}`;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("heading", { name: "MakeReadyOS" })).toBeVisible();
}

async function dragCardToColumn(page: Page, sourceTestId: string, targetTestId: string) {
  const source = page.getByTestId(sourceTestId).first();
  const target = page.getByTestId(targetTestId).first();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
}

async function assertNoPageHorizontalOverflow(page: Page) {
  await expect.poll(() =>
    page.evaluate(() => {
      const overflowWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      return overflowWidth <= window.innerWidth + 4;
    }),
  ).toBe(true);
}

test("toolbar groups settings and keeps account password form usable", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await expect(page.getByTestId("logout-button")).toHaveCount(0);
  await expect(page.getByTestId("theme-mode-select")).toHaveCount(0);
  await page.getByTestId("account-menu").click();
  await expect(page.getByTestId("logout-button")).toBeVisible();
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await page.getByLabel("Current password", { exact: true }).fill("not-submitted");
  await expect(page.getByLabel("Current password", { exact: true })).toHaveValue("not-submitted");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("account-menu")).toBeFocused();
  for (const width of [1920, 1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId("display-menu").click();
    await expect(page.getByTestId("theme-mode-select")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(() => page.locator(".organized-filterbar .filters").evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
  }
});

async function setDisplayMode(page: Page, input: { theme: "default" | "dark" | "light"; eyeStrain?: boolean; dyslexia?: boolean }) {
  await page.getByTestId("display-menu").click();
  await page.getByTestId("theme-mode-select").selectOption(input.theme);
  await page.getByTestId("eye-strain-mode-toggle").setChecked(Boolean(input.eyeStrain));
  await page.getByTestId("dyslexia-mode-toggle").setChecked(Boolean(input.dyslexia));
  await page.getByTestId("display-menu").click();
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

async function openWorkspaceAndAssert(page: Page, tabTestId: string, panelTestId: string) {
  await page.getByTestId(tabTestId).click();
  await expect(page.getByTestId(panelTestId)).toBeVisible();
  await assertNoPageHorizontalOverflow(page);
}

async function openTableFilters(page: Page) {
  const filters = page.getByTestId("advanced-filters").first();
  if (!(await filters.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await filters.locator("summary").click();
  }
  if (!(await filters.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await filters.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
  }
  await expect(filters).toHaveJSProperty("open", true);
}

test.describe("MakeReadyOS browser flows", () => {
  test("app loads and unauthenticated users see login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Use the self-hosted admin account or a provisioned staff user")).toBeVisible();
  });

  test("seeded admin can log in, see board views, and log out via the visible button", async ({ page }) => {
    await login(page, adminEmail, adminPassword);

    await expect(page.getByTestId("tab-table")).toBeVisible();
    await expect(page.getByTestId("tab-dashboard")).toBeVisible();
    await expect(page.getByTestId("tab-kanban")).toBeVisible();
    await expect(page.getByTestId("tab-calendar")).toBeVisible();
    await expect(page.getByTestId("tab-maps")).toBeVisible();
    await expect(page.getByTestId("tab-pond")).toBeVisible();
    await expect(page.getByTestId("tab-vendors")).toBeVisible();
    await expect(page.getByTestId("module-rail-refrigerant")).toBeVisible();
    await expect(page.getByTestId("tab-automations")).toBeVisible();
    await expect(page.getByTestId("tab-activity")).toBeVisible();
    await expect(page.getByTestId("tab-admin")).toBeVisible();
    await expect(page.getByTestId("nav-group-operations")).toContainText("Operations");
    await expect(page.getByTestId("nav-group-visibility")).toContainText("Visibility");
    await expect(page.getByTestId("nav-group-management")).toContainText("Manage");
    await expect(page.getByTestId("nav-group-admin")).toContainText("Admin");
    await expect(page.getByTestId("onboarding-open")).toHaveText("Setup checklist");
    await page.getByTestId("onboarding-open").click();
    await expect(page.getByTestId("onboarding-panel")).toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toContainText("Bring a property online");
    await expect(page.getByTestId("onboarding-panel").getByText("Optional recommendation", { exact: true })).toHaveCount(3);
    await expect(page.getByTestId("onboarding-panel").locator(".onboarding-progress")).toHaveAttribute("aria-label", /of 5 setup steps appear complete/);
    await page.getByTestId("onboarding-skip").click();
    await expect(page.getByTestId("onboarding-panel")).toHaveCount(0);
    await page.getByTestId("onboarding-open").click();
    await expect(page.getByTestId("onboarding-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("onboarding-panel")).toHaveCount(0);
    await page.getByTestId("command-palette-button").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await expect(page.getByTestId("command-palette-group-operations")).toContainText("Operations");
    await expect(page.getByTestId("command-palette-group-visibility")).toContainText("Visibility");
    await expect(page.getByTestId("command-palette-group-modules")).toContainText("Modules");
    await page.getByTestId("command-search").fill("property wiki");
    await page.getByTestId("command-palette-result-wiki").click();
    await expect(page.getByTestId("property-wiki-panel")).toBeVisible();
    await page.getByTestId("command-palette-button").click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-palette-action-table").click();
    await expect(page.getByTestId("board-table-view")).toBeVisible();
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
    await expect(page.getByTestId("board-table-view")).toBeVisible();
    await expect(page.getByTestId("table-add-field-shortcut")).toBeVisible();
    await expect(page.getByTestId("board-window-controls")).toBeVisible();
    const windowedResponse = page.waitForResponse((response) =>
      response.url().includes("/api/make-ready-items") && response.url().includes("limit=250"),
    );
    await page.getByTestId("board-windowed-toggle").check();
    await expect((await windowedResponse).status()).toBe(200);
    await expect(page.getByTestId("board-window-controls")).toContainText("Loaded");
    await page.getByTestId("board-window-disable").click();
    await expect(page.getByTestId("board-windowed-toggle")).not.toBeChecked();
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("dashboard-panel")).toBeVisible();
    await expect(page.getByTestId("needs-attention-panel")).toBeVisible();
    await page.getByTestId("notifications-button").click();
    await expect(page.getByTestId("notification-drawer")).toBeVisible();
    const readAllButton = page.getByTestId("notifications-read-all");
    if (await readAllButton.isEnabled()) {
      await readAllButton.click();
    }
    await page.getByRole("button", { name: "Close notifications" }).click();
    await page.getByTestId("tab-table").click();

    await page.getByTestId("display-menu").click();
    await page.getByTestId("compact-mode-toggle").check();
    await expect(page.locator(".app-shell")).toHaveClass(/compact-mode/);
    await page.getByTestId("theme-mode-select").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())).toBe("#000000");
    await page.getByTestId("theme-mode-select").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text").trim())).toBe("#182432");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--border").trim())).toBe("#c6d1df");
    await page.getByTestId("tab-calendar").click();
    await expect(page.locator(".calendar-grid").first()).toBeVisible();
    await expect(page.locator(".calendar-dow").first()).toHaveText("Sun");
    if (await page.getByTestId("calendar-today").count()) {
      await expect(page.getByTestId("calendar-today").first()).toBeVisible();
    }
    await expect.poll(() => page.locator(".calendar-grid").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(198, 209, 223)");
    await expect(page.getByTestId("calendar-past-day").first()).toBeVisible();
    await expect.poll(() => page.getByTestId("calendar-past-day").first().evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await page.getByTestId("tab-activity").click();
    await expect(page.locator(".activity-table").first()).toBeVisible();
    await expect.poll(() => page.locator(".activity-table th").first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(248, 251, 255)");
    await page.getByTestId("tab-table").click();
    await page.getByTestId("display-menu").click();
    await page.getByTestId("eye-strain-mode-toggle").check();
    await expect(page.locator("html")).toHaveClass(/eye-strain-mode/);
    await page.getByTestId("dyslexia-mode-toggle").check();
    await expect(page.locator("html")).toHaveClass(/dyslexia-mode/);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontFamily)).toContain("OpenDyslexic");
    await page.reload();
    await page.getByTestId("display-menu").click();
    await expect(page.getByTestId("compact-mode-toggle")).toBeChecked();
    await expect(page.locator(".app-shell")).toHaveClass(/compact-mode/);
    await expect(page.getByTestId("theme-mode-select")).toHaveValue("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("eye-strain-mode-toggle")).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/eye-strain-mode/);
    await expect(page.getByTestId("dyslexia-mode-toggle")).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dyslexia-mode/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const logoutResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/auth/logout") && response.request().method() === "POST",
    );
    await page.getByTestId("account-menu").click();
    await page.getByTestId("logout-button").click();
    await expect((await logoutResponsePromise).status()).toBe(200);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("display modes keep core workspaces readable without page overflow", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("display-menu").click();
    await page.getByTestId("compact-mode-toggle").setChecked(true);
    await page.getByTestId("display-menu").click();

    const modes = [
      { label: "default", theme: "default" as const },
      { label: "amoled", theme: "dark" as const },
      { label: "light", theme: "light" as const },
      { label: "eye strain", theme: "dark" as const, eyeStrain: true },
      { label: "dyslexia", theme: "light" as const, dyslexia: true },
    ];
    const workspaces = [
      ["tab-table", "board-table-view"],
      ["tab-kanban", "kanban-board"],
      ["tab-calendar", "calendar-view"],
      ["tab-dashboard", "dashboard-panel"],
      ["tab-maps", "property-maps-panel"],
      ["tab-pond", "frog-pond-panel"],
      ["tab-automations", "automation-panel"],
      ["tab-admin", "admin-panel"],
    ] as const;

    for (const mode of modes) {
      await test.step(`mode: ${mode.label}`, async () => {
        await setDisplayMode(page, mode);
        await expect(page.locator(".app-shell")).toHaveClass(/compact-mode/);
        const tokens = await page.evaluate(() => {
          const styles = getComputedStyle(document.documentElement);
          return {
            text: styles.getPropertyValue("--text").trim(),
            bg: styles.getPropertyValue("--bg").trim(),
            border: styles.getPropertyValue("--border").trim(),
            panel: styles.getPropertyValue("--panel").trim(),
          };
        });
        expect(tokens.text).toBeTruthy();
        expect(tokens.bg).toBeTruthy();
        expect(tokens.border).toBeTruthy();
        expect(tokens.panel).toBeTruthy();
        expect(tokens.text).not.toBe(tokens.bg);
        for (const [tab, panel] of workspaces) {
          await openWorkspaceAndAssert(page, tab, panel);
        }
      });
    }
  });

  test("admin can create a property map and place a unit marker", async ({ page }) => {
    const mapName = uniqueTag("QA Site Map");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-maps").click();
    await expect(page.getByTestId("property-maps-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Map Controls", exact: true })).toBeVisible();
    const taPropertyValue = await page.getByTestId("property-maps-property-select").evaluate((select) => {
      const propertySelect = select as HTMLSelectElement;
      return Array.from(propertySelect.options).find((option) => option.textContent?.startsWith("TA -"))?.value ?? "";
    });
    expect(taPropertyValue).toBeTruthy();
    await page.getByTestId("property-maps-property-select").selectOption(taPropertyValue);
    await page.getByTestId("property-maps-create-name").fill(mapName);
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-maps") && response.request().method() === "POST",
    );
    await page.getByTestId("property-maps-create-submit").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("property-maps-map-select")).toContainText(mapName);
    await expect(page.getByTestId("property-maps-map-select").locator("option:checked")).toContainText(mapName);
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.getByLabel("Map file", { exact: true }).setInputFiles({
      name: "qa-site-map.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
    });
    await expect(page.getByLabel("Map file", { exact: true })).toHaveValue("");
    await expect(page.getByText("File uploaded", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.getByTestId("property-maps-placement-mode").selectOption("unit");
    await page.getByPlaceholder("Search unit...", { exact: true }).fill("284");
    await expect(page.getByPlaceholder("Search unit...", { exact: true })).toHaveValue("284");
    await page.getByRole("listbox").getByRole("button", { name: /^(?:TA )?284(?: \/|$)/ }).click();
    await page.getByPlaceholder("Building", { exact: true }).fill("B1");
    await page.getByPlaceholder("Area", { exact: true }).fill("North");
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/unit-map-locations") && response.request().method() === "PUT",
    );
    await page.getByTestId("property-maps-canvas").click({ position: { x: 180, y: 150 } });
    await expect((await saveResponse).status()).toBe(200);
    const marker = page.locator(".map-marker").filter({ hasText: /^(?:TA )?284$/ });
    await expect(marker).toBeVisible();
    const originalPosition = await marker.getAttribute("style");
    await page.getByPlaceholder("Search unit...", { exact: true }).fill("284");
    await page.getByRole("listbox").getByRole("button", { name: /^(?:TA )?284(?: \/|$)/ }).click();
    const moveResponse = page.waitForResponse((response) =>
      response.url().includes("/api/unit-map-locations") && response.request().method() === "PUT",
    );
    await page.getByTestId("property-maps-canvas").click({ position: { x: 260, y: 210 } });
    await expect((await moveResponse).status()).toBe(200);
    await expect(marker).not.toHaveAttribute("style", originalPosition!);
    await marker.click();
    await expect(page.locator(".map-detail-card")).toContainText("B1");
    await page.locator(".unit-directory-row").getByRole("button", { name: /^(?:TA )?284 / }).click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Frog Pond renders, updates config, and opens item details", async ({ page }, testInfo) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-pond").click();
    await expect(page.getByTestId("frog-pond-panel")).toBeVisible();
    await expect(page.getByTestId("frog-pond-scene")).toBeVisible();
    await expect(page.getByTestId("frog-config")).not.toBeVisible();
    const frog = page.locator('[data-testid^="frog-marker-"]').first();
    await frog.scrollIntoViewIfNeeded();
    const original = await frog.boundingBox();
    await frog.hover();
    await page.waitForTimeout(600);
    const hovered = await frog.boundingBox();
    expect(Math.abs(hovered!.x - original!.x)).toBeLessThan(2);
    expect(Math.abs(hovered!.y - original!.y)).toBeLessThan(2);
    await page.getByTestId("frog-settings-toggle").click();
    await page.getByTestId("frog-group-by").selectOption("riskLevel");
    await page.getByTestId("frog-color-by").selectOption("vacancyStatus");
    await page.getByTestId("frog-animation-toggle").uncheck();
    await page.getByTestId("frog-animation-toggle").check();
    await expect(page.getByTestId("frog-legend")).toContainText("vacancy Status");
    await page.getByTestId("frog-settings-toggle").click();
    await page.locator('[data-testid^="frog-marker-"]').first().click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("item-drawer")).not.toBeVisible();
    await page.getByTestId("frog-pond-scene").screenshot({ path: testInfo.outputPath("pond-desktop.png") });
    await page.getByRole("button", { name: "Pause motion", exact: true }).click();
    await expect(page.getByTestId("frog-pond-panel")).not.toHaveClass(/frog-animated/);
    await page.getByRole("button", { name: "Resume motion", exact: true }).click();
    await expect(page.getByTestId("frog-pond-panel")).toHaveClass(/frog-animated/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByTestId("frog-pond-panel")).not.toHaveClass(/frog-animated/);
    await page.setViewportSize({ width: 412, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.getByTestId("frog-pond-panel").screenshot({ path: testInfo.outputPath("pond-mobile.png") });
    expect(await page.locator('[data-testid^="frog-marker-"]').first().evaluate(el => getComputedStyle(el).touchAction)).toBe("pan-y");
    await page.locator('[data-testid^="frog-marker-"]').first().click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
  });

  test("Dashboard opens the Frog Pond preview path", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("dashboard-frog-preview")).toBeVisible();
    await page.getByTestId("dashboard-open-pond").click();
    await expect(page.getByTestId("frog-pond-panel")).toBeVisible();
  });

  test("admin can render Kanban and drag a card between columns", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-kanban").click();
    await expect(page.getByTestId("kanban-board")).toBeVisible();
    await expect(page.getByTestId("kanban-config")).toBeVisible();
    await page.getByTestId("kanban-color-by").selectOption("scopeLevel");
    await expect(page.getByTestId("kanban-guide")).toContainText("scopeLevel");

    const sourceCard = page.getByTestId("kanban-card-ta-284");
    const targetColumn = page.getByTestId("kanban-column-medium");

    await expect(sourceCard).toBeVisible();
    await expect(targetColumn).toBeVisible();
    await dragCardToColumn(page, "kanban-card-ta-284", "kanban-column-body-medium");

    await expect(targetColumn.getByTestId("kanban-card-ta-284")).toBeVisible();
  });

  test("item details drawer opens from table and Kanban and closes with Escape", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("item-details-ta-284").click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await expect(page.getByTestId("item-drawer")).toContainText("TA 284");
    await expect(page.getByTestId("drawer-field-assignedTech")).toBeVisible();
    await expect(page.getByTestId("drawer-risk-section")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("item-drawer")).toHaveCount(0);
    await page.getByTestId("tab-kanban").click();
    await page.getByTestId("kanban-details-ta-284").click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
  });

  test("item drawer supports operational updates, local photos, and checklist execution", async ({ page }) => {
    const note = `QA field note ${Date.now()}`;
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("item-details-ta-284").click();
    await page.getByTestId("comment-input").fill(note);
    await page.getByTestId("comment-submit").click();
    await expect(page.getByTestId("comment-list")).toContainText(note);
    await page.getByTestId("attachment-upload").setInputFiles([
      {
        name: "qa-finish-photo.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("QA local attachment"),
      },
      {
        name: "qa-damage-photo.png",
        mimeType: "image/png",
        buffer: Buffer.from("not-a-real-png-but-valid-upload-smoke"),
      },
      {
        name: "qa-large-walk-photo.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(2 * 1024 * 1024, 7),
      },
    ]);
    await expect(page.getByTestId("attachment-stage-filter")).toContainText("All photos/files");
    await expect(page.getByTestId("drawer-attachments")).toContainText("3 files");
    await page.getByTestId("attachment-gallery-open").click();
    await expect(page.getByTestId("attachment-gallery-modal")).toBeVisible();
    await expect(page.getByTestId("attachment-gallery-grid")).toContainText("qa-finish-photo.txt");
    await expect(page.getByTestId("attachment-gallery-grid")).toContainText("qa-damage-photo.png");
    await expect(page.getByTestId("attachment-gallery-grid")).toContainText("qa-large-walk-photo.png");
    await expect(page.getByTestId("attachment-gallery-download-zip")).toBeVisible();
    await expect(page.getByTestId("attachment-gallery-stage-filter")).toContainText("Needs classification");
    await expect(page.getByTestId("inspection-evidence-panel")).toContainText("Evidence package");
    await expect(page.getByTestId("attachment-download-button").first()).toBeVisible();
    await page.getByTestId("attachment-gallery-grid").getByTestId("attachment-preview-trigger").first().click();
    await expect(page.getByTestId("attachment-preview-modal")).toBeVisible();
    await expect(page.getByTestId("attachment-preview-download")).toBeVisible();
    await page.getByTestId("attachment-pin-label").fill("QA wall damage");
    await page.getByTestId("attachment-add-pin-mode").click();
    await expect(page.getByTestId("attachment-add-pin-mode")).toContainText("Click image to place pin");
    const markupBox = await page.getByTestId("attachment-image-markup").boundingBox();
    expect(markupBox).not.toBeNull();
    await page.mouse.click((markupBox?.x ?? 0) + Math.min(120, (markupBox?.width ?? 240) / 2), (markupBox?.y ?? 0) + Math.min(90, (markupBox?.height ?? 180) / 2));
    await expect(page.getByTestId("attachment-pin-list")).toContainText("QA wall damage");
    await page.getByTestId("attachment-preview-modal").getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByTestId("attachment-preview-modal")).toBeHidden();
    await expect(page.getByTestId("attachment-gallery-modal")).toBeVisible();
    await page.getByTestId("attachment-gallery-grid").getByTestId("attachment-editor-toggle").first().click();
    await page.getByTestId("attachment-stage-select").first().selectOption("INITIAL_WALK");
    await page.getByTestId("attachment-category-input").first().fill("Damage");
    await page.getByTestId("attachment-category-input").first().blur();
    await page.getByTestId("attachment-charge-toggle").first().check();
    await expect(page.getByTestId("attachment-gallery-modal")).toContainText("Charge candidate");
    await expect(page.getByTestId("attachment-gallery-charge-zip")).toBeVisible();
    await expect(page.getByTestId("attachment-category-downloads")).toContainText("Damage");
    await page.keyboard.press("Escape");
    const templateOption = page.getByTestId("checklist-template-select").locator("option").nth(1);
    if (await templateOption.count()) {
      await page.getByTestId("checklist-template-select").selectOption({ index: 1 });
      await page.getByTestId("checklist-attach").click();
      await expect(page.getByTestId("drawer-checklists").locator(".checklist-instance").last()).toBeVisible();
      await page.getByTestId("drawer-checklists").locator(".checklist-instance").last().locator("input[type=checkbox]").first().check();
      await expect(page.getByTestId("drawer-checklists").locator(".checklist-instance").last()).toContainText("1/");
    }
  });

  test("admin can manage vendors and assign contractor work from the item drawer", async ({ page }) => {
    const vendorName = uniqueTag("QA Vendor");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-vendors").click();
    await expect(page.getByTestId("vendors-panel")).toBeVisible();
    await page.getByTestId("vendor-create-name").fill(vendorName);
    await page.getByTestId("vendor-create-trade").fill("Flooring");
    await page.getByTestId("vendor-create-submit").click();
    await expect(page.getByTestId("vendors-panel")).toContainText(vendorName);

    await page.getByTestId("tab-table").click();
    await page.getByTestId("item-details-ta-284").click();
    await expect(page.getByTestId("drawer-vendor-assignments")).toBeVisible();
    await page.getByTestId("drawer-vendor-select").selectOption({ label: `${vendorName} / Flooring` });
    await page.getByTestId("drawer-vendor-assignment-submit").click();
    await expect(page.getByTestId("drawer-vendor-assignments")).toContainText(vendorName);
  });

  test("My Work, command palette, notification preferences, and dashboard preset controls render", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-search").fill("TA 284");
    await expect(page.getByTestId("command-palette")).toContainText("TA 284");
    await page.keyboard.press("Escape");
    await page.getByTestId("tab-my-work").click();
    await expect(page.getByTestId("my-work-panel")).toBeVisible();
    const quickStatus = page.locator("[data-testid^='my-work-status-']").first();
    if (await quickStatus.count()) {
      await expect(quickStatus).toBeVisible();
    }
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByTestId("connection-banner")).toContainText("offline");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByTestId("connection-banner")).toHaveCount(0);
    await page.getByTestId("tab-dashboard").click();
    await page.getByTestId("dashboard-layout").selectOption("focus");
    await expect(page.getByTestId("dashboard-panel")).toHaveClass(/dashboard-layout-focus/);
    await page.getByTestId("notifications-button").click();
    await page.getByTestId("notification-preferences").locator("summary").click();
    await expect(page.getByTestId("notification-preferences")).toContainText("Comments");
  });

  test("admin can use table filters and module rail without the old saved-view sidebar", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
    await openTableFilters(page);
    await page.getByTestId("filter-vacancy-status").selectOption("__vacant__");
    await expect(page.getByTestId("active-filter-vacancy")).toContainText("Vacant");
    await page.locator(".filter-chip").filter({ hasText: "Vacancy" }).click();
    await expect(page.getByTestId("active-filter-vacancy")).toHaveCount(0);
  });

  test("admin can rename a built-in display label without changing its board field", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("column-menu-unitNumber").first().click();
    const itemMenu = page.getByTestId("column-header-menu-unitNumber");
    await expect(itemMenu).toBeVisible();
    expect(await itemMenu.evaluate((element) => element.parentElement === document.body)).toBe(true);
    const menuBox = await itemMenu.boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press("Escape");
    await expect(itemMenu).toHaveCount(0);
    const itemHeader = page.getByTestId("board-column-header-unitNumber").first();
    const originalWidth = (await itemHeader.boundingBox())!.width;
    await itemHeader.getByRole("button", { name: "Resize Item column" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await itemHeader.boundingBox())!.width).toBeGreaterThan(originalWidth);
    await page.keyboard.press("Home");
    await expect(itemHeader.locator("xpath=ancestor::table")).toHaveAttribute("data-item-width", "auto");
    await page.getByTestId("column-menu-vacatedDate").first().click();
    await expect(page.getByTestId("column-header-menu-vacatedDate").first()).toBeVisible();
    await page.getByTestId("column-header-menu-vacatedDate").first().getByRole("menuitem", { name: "Rename column" }).click();
    await page.getByTestId("column-rename-input").fill("QA Vacated");
    const renameResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/columns/vacatedDate") && response.request().method() === "PATCH",
    );
    await page.getByTestId("column-rename-save").click();
    await expect((await renameResponse).status()).toBe(200);
    await expect(page.getByTestId("board-column-header-vacatedDate").first()).toContainText("QA Vacated");
    await page.getByTestId("column-menu-vacatedDate").first().click();
    await page.getByTestId("column-header-menu-vacatedDate").first().getByRole("menuitem", { name: "Rename column" }).click();
    const resetResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/columns/vacatedDate") && response.request().method() === "PATCH",
    );
    await page.getByTestId("column-label-reset").click();
    await expect((await resetResponse).status()).toBe(200);
    await expect(page.getByTestId("board-column-header-vacatedDate").first()).toContainText("Vacated");
    await expect(page.getByText("Column label updated").last()).toBeVisible();
  });

  test("table header menu hides and moves optional columns", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("column-menu-applicant").first().click();
    await page.getByTestId("column-header-menu-applicant").first().getByRole("menuitem", { name: "Move right" }).click();
    const headers = await page.locator("table.board-table").first().locator("thead th").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
    expect(headers.indexOf("board-column-header-applicant")).toBeGreaterThan(headers.indexOf("board-column-header-moveOutDate"));
    await page.getByTestId("column-menu-applicant").first().click();
    await page.getByTestId("column-header-menu-applicant").first().getByRole("menuitem", { name: "Hide column" }).click();
    await expect(page.getByTestId("board-column-header-applicant")).toHaveCount(0);
  });

  test("module rail stays minimal after reload", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail-button.placeholder")).toHaveCount(0);
  });

  test("admin can add property and unit then create a make-ready turn", async ({ page }) => {
    const code = `QAE${Date.now()}`;
    const propertyName = `QA Property ${Date.now()}`;
    const unitNumber = `Q${Date.now()}`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-operations").click();
    await expect(page.getByTestId("operations-panel")).toBeVisible();

    await page.getByTestId("property-create-name").fill(propertyName);
    await page.getByTestId("property-create-code").fill(code);
    const propertyResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/properties") && response.request().method() === "POST",
    );
    await page.getByTestId("property-create-submit").click();
    await expect((await propertyResponse).status()).toBe(201);
    await page.getByTestId(`property-row-${code.toLowerCase()}`).click();

    await expect(page.getByTestId("operating-calendar-management")).toBeVisible();
    await page.getByTestId("operating-calendar-avoid-monday").check();
    await page.getByTestId("operating-calendar-avoid-friday").check();
    await page.getByTestId("operating-calendar-daily-limit").fill("2");
    await page.getByTestId("operating-calendar-scope-day").selectOption("1");
    await page.getByTestId("operating-calendar-work-start-day").selectOption("2");
    const calendarResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/operations/properties/`) && response.url().includes("/operating-calendar") && response.request().method() === "PUT",
    );
    await page.getByTestId("operating-calendar-save").click();
    await expect((await calendarResponse).status()).toBe(200);

    const importedUnit = `IMP${Date.now()}`;
    await page.getByTestId("unit-import-csv").fill(`Unit Number\tBuilding Number\tFloor Plan\tBeds\tBaths\tSq Ft\tAvailability Status\tBudgeted\n${importedUnit}\t26\tQA \"B2\"\t2\t2\t1,246\tNTV Leased\tyes`);
    await expect(page.getByTestId("unit-import-preview")).toContainText("1 rows");
    await expect(page.getByTestId("unit-import-property").locator("option:checked")).toHaveText(`${code} - ${propertyName}`);
    await expect(page.getByTestId("availability-import-property").locator("option:checked")).toHaveText(`${code} - ${propertyName}`);
    let cancelledImportRequests = 0;
    const countImports = (request: import("@playwright/test").Request) => {
      if (request.url().includes("/api/operations/units/import") && request.method() === "POST") cancelledImportRequests++;
    };
    page.on("request", countImports);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(`${code} - ${propertyName}`);
      await dialog.dismiss();
    });
    await page.getByTestId("unit-import-submit").click();
    await expect(page.getByTestId("unit-import-csv")).toHaveValue(new RegExp(importedUnit));
    expect(cancelledImportRequests).toBe(0);
    page.off("request", countImports);
    const importResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/units/import") && response.request().method() === "POST",
    );
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(`${code} - ${propertyName}`);
      await dialog.accept();
    });
    await page.getByTestId("unit-import-submit").click();
    await expect((await importResponse).status()).toBe(200);
    await expect(page.getByTestId(`unit-row-${importedUnit.toLowerCase()}`)).toContainText("NTV leased");

    const sparseUnit = `SP${Date.now()}`;
    await expect(page.getByTestId("unit-import-csv")).toHaveValue("");
    await page.getByTestId("unit-import-csv").fill(`unit\tfloorPlan\tsqft\n${sparseUnit}\tQA Sparse\t900`);
    await expect(page.getByTestId("unit-import-preview")).toContainText("1 rows");
    const sparseImportResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/units/import") && response.request().method() === "POST",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("unit-import-submit").click();
    await expect((await sparseImportResponse).status()).toBe(200);
    await expect(page.getByTestId(`unit-row-${sparseUnit.toLowerCase()}`)).toContainText("QA Sparse");

    await page.getByTestId("unit-create-property").selectOption({ label: code });
    await page.getByTestId("unit-create-number").fill(unitNumber);
    await page.getByTestId("unit-create-floor-plan").fill("QA B1");
    await page.getByTestId("unit-create-square-feet").fill("820");
    const unitResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/units") && response.request().method() === "POST",
    );
    await page.getByTestId("unit-create-submit").click();
    await expect((await unitResponse).status()).toBe(201);

    await page.getByTestId("item-create-property").selectOption({ label: `${code} - ${propertyName}` });
    await page.locator(".turn-form").getByPlaceholder("Search unit...", { exact: true }).fill(unitNumber);
    await page.getByRole("listbox").getByRole("button", { name: new RegExp(unitNumber) }).click();
    await page.getByTestId("item-create-status").selectOption("LITE");
    const itemResponse = page.waitForResponse((response) =>
      response.url().includes("/api/make-ready-items") && response.request().method() === "POST",
    );
    await page.getByTestId("item-create-submit").click();
    await expect((await itemResponse).status()).toBe(201);
    await page.getByTestId("tab-table").click();
    await page.getByTestId("table-filter-property").selectOption({ label: `${code} / ${propertyName}` });
    await page.getByTestId("board-search").fill(unitNumber);
    await expect(page.getByText(unitNumber).first()).toBeVisible();
  });

  test("admin can fast-add under a group, assign staff, move and archive selected items", async ({ page }) => {
    const unitNumber = `B${Date.now()}`;

    await login(page, adminEmail, adminPassword);
    const utilityWidth = await page.getByTestId("board-group-table-ready-units-ta").locator("th.select-column").evaluate((element) => element.getBoundingClientRect().width);
    expect(utilityWidth).toBeLessThan(44);
    await expect.poll(() => page.getByTestId("board-group-table-ready-units-ta").locator("td.identity-column").first().evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    await page.getByTestId("add-item-row-make-ready-board-ta").click();
    await expect(page.getByTestId("add-item-form-make-ready-board-ta")).toBeVisible();
    await page.getByTestId("add-item-unit-number-make-ready-board-ta").fill(unitNumber);
    await page.getByTestId("add-item-tech-make-ready-board-ta").selectOption({ label: "Default Admin - ADMIN" });
    const addResponse = page.waitForResponse((response) => response.url().includes("/api/make-ready-items") && response.request().method() === "POST");
    await page.getByTestId("add-item-save-make-ready-board-ta").click();
    await expect((await addResponse).status()).toBe(201);

    await page.getByTestId(`select-item-${slugify(unitNumber)}`).check();
    await expect(page.getByTestId("batch-action-bar")).toContainText("1 selected");
    await page.getByTestId("batch-group-select").selectOption("DOWN_AND_MODELS");
    const moveResponse = page.waitForResponse((response) => response.url().includes("/api/make-ready-items/batch") && response.request().method() === "POST");
    await page.getByTestId("batch-move").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await moveResponse).status()).toBe(200);
    await expect(page.getByTestId("board-group-table-down-and-models").getByTestId(`select-item-${slugify(unitNumber)}`)).toBeVisible();

    await page.getByTestId(`select-item-${slugify(unitNumber)}`).check();
    const archiveResponse = page.waitForResponse((response) => response.url().includes("/api/make-ready-items/batch") && response.request().method() === "POST");
    await page.getByTestId("batch-archive").click();
    await expect(page.getByTestId("confirm-dialog")).toContainText("1 selected make-ready item");
    await page.getByTestId("confirm-dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByTestId(`select-item-${slugify(unitNumber)}`)).toBeChecked();
    await page.getByTestId("batch-archive").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await archiveResponse).status()).toBe(200);
    await expect(page.getByTestId(`select-item-${slugify(unitNumber)}`)).toHaveCount(0);
    await page.getByTestId("top-archive-mode").selectOption("archived");
    await expect(page.getByTestId("section-title-archive-ta")).toContainText("TA / Archive");
    await expect(page.getByTestId("board-group-table-archive-ta").getByTestId(`select-item-${slugify(unitNumber)}`)).toBeVisible();
    await page.getByTestId("top-archive-mode").selectOption("active");
  });

  test("admin can rename a board section inline and restore its label", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("section-rename-make-ready-board-ta").click();
    await page.getByTestId("section-name-input-make-ready-board-ta").fill("Active Turns QA");
    await page.getByTestId("section-name-input-make-ready-board-ta").press("Enter");
    await expect(page.getByTestId("section-title-make-ready-board-ta")).toContainText("Active Turns QA");
    await page.getByTestId("section-rename-make-ready-board-ta").click();
    await page.getByTestId("section-name-input-make-ready-board-ta").fill("Make Ready");
    await page.getByTestId("section-name-input-make-ready-board-ta").press("Enter");
    await expect(page.getByTestId("section-title-make-ready-board-ta")).toContainText("Make Ready");
  });

  test("admin can create a custom field and edit a board value", async ({ page }) => {
    const fieldLabel = `QA Walk Note ${Date.now()}`;
    const fieldKey = customFieldKey(fieldLabel);
    const displayLabel = `${fieldLabel} Display`;
    const cellId = `custom-field-cell-${fieldKey}-ta-284`;
    const inputId = `custom-field-input-${fieldKey}-ta-284`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await expect(page.getByTestId("custom-fields-panel")).toBeVisible();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("TEXT");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-table").click();
    await expect(page.getByTestId("board-group-table-ready-units-ta").getByTestId(`custom-field-header-${fieldKey}`)).toBeVisible();
    await page.getByTestId(`column-menu-${fieldKey}`).first().click();
    await page.getByTestId(`column-header-menu-${fieldKey}`).first().getByRole("menuitem", { name: "Rename column" }).click();
    await page.getByTestId("column-rename-input").fill(displayLabel);
    const renameFieldResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/custom-fields\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("column-rename-save").click();
    await expect((await renameFieldResponse).status()).toBe(200);
    await expect(page.getByTestId(`custom-field-header-${fieldKey}`).first()).toContainText(displayLabel);
    await page.getByTestId(cellId).click();
    await page.getByTestId(inputId).fill("Needs final key check");
    await expect(page.getByTestId(`cell-status-${fieldKey}-ta-284`)).toContainText("Unsaved");
    const saveResponse = page.waitForResponse((response) =>
      response.url().includes("/custom-fields/") && response.request().method() === "PUT",
    );
    await page.getByTestId(inputId).press("Enter");
    await expect((await saveResponse).status()).toBe(200);
    await expect(page.getByTestId(cellId)).toContainText("Needs final key check");
    await expect(page.getByTestId(`cell-status-${fieldKey}-ta-284`)).toContainText("Saved");

    await openTableFilters(page);
    await page.getByTestId("custom-filter-field-add").selectOption({ label: displayLabel });
    await page.getByTestId("custom-filter-add").click();
    await page.getByTestId(`custom-filter-value-${fieldKey}`).fill("final key");
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${displayLabel}: Contains final key`);
    await expect(page.getByTestId(cellId)).toContainText("Needs final key check");

    await page.getByTestId("tab-kanban").click();
    await expect(page.getByTestId("kanban-board")).toBeVisible();
    await expect(page.getByTestId("active-filter-bar")).toContainText(displayLabel);
  });

  test("custom status filters use active options and exclude archived field definitions", async ({ page }) => {
    const fieldLabel = `QA Status Filter ${Date.now()}`;
    const fieldKey = customFieldKey(fieldLabel);

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("SINGLE_SELECT");
    await page.getByTestId("custom-field-option-label-0").fill("NEEDS REVIEW");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-table").click();
    await page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`).click();
    const writeResponse = page.waitForResponse((response) =>
      response.url().includes("/custom-fields/") && response.request().method() === "PUT",
    );
    await page.getByTestId(`custom-field-input-${fieldKey}-ta-284`).selectOption("NEEDS REVIEW");
    await expect((await writeResponse).status()).toBe(200);

    await openTableFilters(page);
    await page.getByTestId("custom-filter-field-add").selectOption({ label: fieldLabel });
    await page.getByTestId("custom-filter-add").click();
    await expect(page.getByTestId(`custom-filter-value-${fieldKey}`).locator("option", { hasText: "NEEDS REVIEW" })).toHaveCount(1);
    await page.getByTestId(`custom-filter-value-${fieldKey}`).selectOption("NEEDS REVIEW");
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${fieldLabel}: Equals NEEDS REVIEW`);
    await expect(page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`)).toBeVisible();
    await page.getByTestId(`custom-filter-remove-${fieldKey}`).click();

    await page.getByTestId("tab-fields").click();
    await page.getByTestId(`custom-field-item-${fieldKey}`).click();
    await page.getByTestId("custom-field-archive").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.getByTestId("tab-table").click();
    await expect(page.getByTestId("custom-filter-field-add").locator("option", { hasText: fieldLabel })).toHaveCount(0);
  });

  test("admin assigns active staff and keyboard-tabs through text editing", async ({ page }) => {
    const assignedCell = "builtin-cell-assignedTech-ta-284";
    const assignedInput = "builtin-input-assignedTech-ta-284";

    await login(page, adminEmail, adminPassword);
    await page.getByTestId(assignedCell).click();
    const saveResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/make-ready-items\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId(assignedInput).selectOption({ label: "Default Admin - ADMIN" });
    await expect((await saveResponse).status()).toBe(200);
    await expect(page.getByTestId("cell-status-assignedTech-ta-284")).toContainText("Saved");
    await expect(page.getByTestId(assignedCell)).toContainText("Default Admin");

    await page.getByTestId("builtin-cell-applicant-ta-284").click();
    await page.getByTestId("builtin-input-applicant-ta-284").fill("Keyboard QA");
    const textSaveResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/make-ready-items\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("builtin-input-applicant-ta-284").press("Tab");
    await expect((await textSaveResponse).status()).toBe(200);
    await expect(page.getByTestId("builtin-input-moveOutDate-ta-284")).toBeVisible();
  });

  test("admin assigns a managed floor plan from the table and sees linked metadata", async ({ page }) => {
    const planName = `QA Managed ${Date.now()}`;
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("builtin-cell-floorPlan-ta-284").click();
    await page.getByTestId("manage-floor-plans-ta-284").click();
    await expect(page.getByTestId("inline-floor-plan-modal")).toBeVisible();
    await page.getByTestId("inline-floor-plan-code").fill(`QA${Date.now()}`);
    await page.getByTestId("inline-floor-plan-name").fill(planName);
    await page.getByTestId("inline-floor-plan-beds").fill("2");
    await page.getByTestId("inline-floor-plan-baths").fill("1.5");
    await page.getByTestId("inline-floor-plan-sqft").fill("940");
    const createPlanResponse = page.waitForResponse((response) => response.url().includes("/api/operations/floor-plans") && response.request().method() === "POST");
    await page.getByTestId("inline-floor-plan-add").click();
    await expect((await createPlanResponse).status()).toBe(201);
    await page.getByTestId("inline-floor-plan-modal").getByRole("button", { name: "Close", exact: true }).click();
    const floorPlanInput = page.getByTestId("builtin-input-floorPlan-ta-284");
    const floorPlanOption = floorPlanInput.locator("option", { hasText: planName });
    await expect(floorPlanOption).toHaveCount(1);
    const floorPlanValue = await floorPlanOption.first().getAttribute("value");
    const unitUpdate = page.waitForResponse((response) => response.url().match(/\/api\/operations\/units\/[^/]+$/) !== null && response.request().method() === "PATCH");
    await floorPlanInput.selectOption(floorPlanValue ?? "");
    await expect((await unitUpdate).status()).toBe(200);
    await expect(page.getByTestId("builtin-cell-floorPlan-ta-284")).toContainText(planName);
    await expect(page.getByTestId("builtin-cell-floorPlan-ta-284")).toContainText("2bd / 1.5ba / 940sf");
  });

  test("admin can add a status option directly from a table dropdown", async ({ page }) => {
    const label = uniqueTag("QA-Paint-Choice");
    const renamed = `${label}-updated`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("builtin-cell-paintStatus-ta-284").click();
    await page.getByTestId("manage-options-paintStatus-ta-284").click();
    await expect(page.getByTestId("table-option-modal")).toBeVisible();
    await page.getByTestId("table-option-label").fill(label);
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/options") && response.request().method() === "POST",
    );
    await page.getByTestId("table-option-save").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("table-option-modal")).toHaveCount(0);
    await page.getByTestId("builtin-cell-paintStatus-ta-284").click();
    await page.getByTestId("manage-options-paintStatus-ta-284").click();
    const optionInput = page.getByTestId("table-option-modal").getByLabel(`Rename ${label}`);
    await optionInput.fill(renamed);
    const updateResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/operations\/options\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("table-option-save-existing").click();
    await expect((await updateResponse).status()).toBe(200);
  });

  test("dashboard cards and charts apply clearable structured filters across views", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("dashboard-readiness-ratios")).toBeVisible();
    await expect(page.getByTestId("dashboard-donut-vacancy-pipeline")).toBeVisible();
    await expect(page.getByTestId("analytics-panel")).toBeVisible();
    await page.getByTestId("kpi-overdue").click();
    await expect(page.getByTestId("board-table-view")).toBeVisible();
    await expect(page.getByTestId("active-filter-overdue")).toBeVisible();
    await page.getByTestId("clear-structured-filters").click();
    await expect(page.getByTestId("active-filter-bar")).toHaveCount(0);

    await page.getByTestId("tab-dashboard").click();
    await page.locator('[data-testid^="dashboard-vacancy-"]').first().click();
    await expect(page.getByTestId("active-filter-vacancy")).toBeVisible();
    await page.getByTestId("tab-kanban").click();
    await expect(page.getByTestId("active-filter-vacancy")).toBeVisible();
    await expect(page.getByTestId("kanban-board")).toBeVisible();
    await page.getByTestId("tab-calendar").click();
    await expect(page.getByTestId("active-filter-vacancy")).toBeVisible();
    await expect(page.getByTestId("calendar-view")).toBeVisible();
  });

  test("risk dashboard drilldown shows board risk indicators and drawer reasons", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-dashboard").click();
    await expect(page.getByTestId("kpi-riskHigh")).toBeVisible();
    await page.getByTestId("kpi-riskHigh").click();
    await expect(page.getByTestId("active-filter-risk-level")).toContainText("HIGH");
    await expect(page.locator('[data-testid^="risk-pill-"]').first()).toBeVisible();
    await page.locator('[data-testid^="item-details-"]').first().click();
    await expect(page.getByTestId("drawer-risk-section")).toBeVisible();
    await expect(page.getByTestId("drawer-risk-section")).toContainText(/risk|RISK/i);
    await expect(page.getByTestId("unit-history-section")).toBeVisible();
    await expect(page.getByTestId("history-coverage-notice")).toContainText("This is not a full audit");
  });

  test("schedule exposes NTV terminology and an active custom date track", async ({ page }) => {
    const fieldLabel = `QA Cleaning Date ${Date.now()}`;
    const fieldKey = customFieldKey(fieldLabel);
    const month = new Date().toISOString().slice(0, 7);

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("DATE");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-table").click();
    await page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`).click();
    const writeResponse = page.waitForResponse((response) =>
      response.url().includes("/custom-fields/") && response.request().method() === "PUT",
    );
    await page.getByTestId(`custom-field-input-${fieldKey}-ta-284`).fill(`${month}-14`);
    await page.getByTestId(`custom-field-input-${fieldKey}-ta-284`).press("Enter");
    await expect((await writeResponse).status()).toBe(200);

    await openTableFilters(page);
    await page.getByTestId("custom-filter-field-add").selectOption({ label: fieldLabel });
    await page.getByTestId("custom-filter-add").click();
    await page.getByTestId(`custom-filter-operator-${fieldKey}`).selectOption("before");
    await page.getByTestId(`custom-filter-value-${fieldKey}`).fill(`${month}-15`);
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${fieldLabel}: Before ${month}-15`);
    await expect(page.getByTestId(`custom-field-cell-${fieldKey}-ta-284`)).toBeVisible();

    await page.getByTestId("tab-operations").click();
    await expect(page.getByTestId("schedule-track-management")).toBeVisible();
    await expect(page.getByTestId("schedule-track-presets")).toBeVisible();
    await expect(page.getByTestId("schedule-track-preset-move-in")).toBeVisible();
    await page.getByTestId("schedule-track-create-source").selectOption({ label: fieldLabel });
    await page.getByTestId("schedule-track-create-basis").selectOption("FIXED");
    const createTrackResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operations/schedule-tracks") && response.request().method() === "POST",
    );
    await page.getByTestId("schedule-track-create-submit").click();
    await expect((await createTrackResponse).status()).toBe(201);

    await page.getByTestId("tab-calendar").click();
    await expect(page.getByTestId("active-filter-bar")).toContainText(`${fieldLabel}: Before ${month}-15`);
    await expect(page.locator(".calendar-dow").first()).toHaveText(/sun/i);
    if (await page.getByTestId("calendar-today").count()) {
      await expect(page.getByTestId("calendar-today").first()).toBeVisible();
    }
    await expect(page.getByTestId("calendar-panel-track-0")).toContainText("NTV / Notice to Vacate");
    await expect(page.getByTestId("calendar-legend-0")).toBeVisible();
    await expect(page.getByTestId("calendar-track-guidance-0")).toContainText("Risk cues:");
    await expect(page.getByTestId("calendar-track-guidance-0")).toContainText("Compatibility:");
    await page.getByTestId("calendar-panel-track-0").selectOption({ label: "NTV / Notice to Vacate" });
    await expect(page.getByTestId("calendar-color-source-0")).toContainText("status colors");
    await page.getByTestId("calendar-panel-track-0").selectOption({ label: fieldLabel });
    await expect(page.getByTestId("calendar-color-source-0")).toContainText("Fixed track color");
    if (await page.locator(".calendar-day-conflicts").count()) {
      await expect(page.locator(".calendar-day-conflicts").first()).toBeVisible();
    }
    await expect(page.getByText("TA 284").first()).toBeVisible();
    await page.getByText("TA 284").first().click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("calendar-layout-select").selectOption("split");
    await expect(page.getByTestId("calendar-panel-1")).toBeVisible();
    await page.getByTestId("calendar-layout-select").selectOption("grid");
    await expect(page.getByTestId("calendar-panel-3")).toBeVisible();
  });

  test("admin can create a user, update role, deactivate, and reactivate", async ({ page }) => {
    const userName = uniqueTag("qa-user");
    let userEmail = `${userName}@example.com`;
    const userRowId = `admin-user-row-${slugify(userName)}`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("admin-panel")).toBeVisible();

    await page.getByTestId("admin-create-full-name").fill(userName);
    await page.getByTestId("admin-create-username").fill(userName);
    await page.getByTestId("admin-create-email").fill(userEmail);
    await page.getByTestId("admin-create-role").selectOption("VIEWER");
    await page.getByTestId("admin-create-password").fill("TempUser!23456");
    await page.getByTestId("admin-create-user-button").click();

    await page.getByTestId("admin-user-search").fill(userEmail);
    const userRow = page.getByTestId(userRowId);
    await expect(userRow).toBeVisible();
    await userRow.click();

    for (const width of [1100, 820, 412]) {
      await page.setViewportSize({ width, height: 915 });
      const bounds = await userRow.locator("xpath=ancestor::div[contains(@class, 'admin-user-table-wrap')]").evaluate((element) => {
        const table = element.getBoundingClientRect();
        const section = element.closest(".admin-section")!.getBoundingClientRect();
        return { tableRight: table.right, sectionRight: section.right, sectionLeft: section.left };
      });
      expect(bounds.tableRight).toBeLessThanOrEqual(bounds.sectionRight);
      expect(bounds.sectionRight).toBeLessThanOrEqual(width);
      expect(bounds.sectionLeft).toBeGreaterThanOrEqual(0);
    }
    await userRow.getByRole("button", { name: "Edit account" }).click();
    await expect(page.getByTestId("admin-edit-email")).toBeInViewport();
    userEmail = `${userName}-recovery@example.com`;
    await page.getByTestId("admin-edit-email").fill(userEmail);
    const emailSaved = page.waitForResponse(response => response.url().match(/\/api\/admin\/users\/[^/]+$/) !== null && response.request().method() === "PATCH");
    await page.getByTestId("admin-save-user-button").click();
    expect((await emailSaved).status()).toBe(200);
    await page.getByTestId("admin-user-search").fill(userEmail);
    await expect(userRow).toContainText(userEmail);
    await expect(page.getByTestId("admin-edit-username")).toHaveValue(userName);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.getByTestId("admin-edit-role").selectOption("MANAGER");
    await page.getByTestId("admin-save-user-button").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByText(`Updated ${userName}`)).toBeVisible();

    const deactivateResponsePromise = page.waitForResponse((response) =>
      response.url().match(/\/api\/admin\/users\/[^/]+$/) !== null && response.request().method() === "DELETE",
    );
    await page.getByTestId("admin-deactivate-user-button").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await deactivateResponsePromise).status()).toBe(200);

    await page.reload();
    await page.getByTestId("tab-admin").click();
    await page.getByTestId("admin-user-search").fill(userEmail);
    await page.getByTestId(userRowId).click();
    await expect(page.getByTestId("admin-reactivate-user-button")).toBeVisible();

    const reactivateResponsePromise = page.waitForResponse((response) =>
      response.url().match(/\/api\/admin\/users\/[^/]+$/) !== null && response.request().method() === "PATCH",
    );
    await page.getByTestId("admin-reactivate-user-button").click();
    await expect((await reactivateResponsePromise).status()).toBe(200);

    await page.reload();
    await page.getByTestId("tab-admin").click();
    await page.getByTestId("admin-user-search").fill(userEmail);
    await page.getByTestId(userRowId).click();
    await expect(page.getByTestId("admin-deactivate-user-button")).toBeVisible();
  });

  test("admin sees native backup transfer tools and invalid backup reports an error", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("backup-transfer-panel")).toBeVisible();
    await expect(page.getByTestId("backup-export-button")).toBeVisible();

    await page.getByTestId("backup-file-input").setInputFiles({
      name: "invalid-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ format: "not-makereadyos", version: 1 })),
    });
    await page.getByTestId("backup-dry-run-button").click();
    await expect(page.getByTestId("backup-error")).toContainText("Invalid MakeReadyOS backup");
  });

  test("admin can inspect upload storage and validate a NAS path", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("storage-settings-panel")).toBeVisible();
    await expect(page.getByTestId("storage-mode")).toBeVisible();
    await expect(page.getByTestId("storage-upload-limit")).toContainText("No MakeReadyOS per-file limit");
    await page.getByTestId("storage-target-path").fill("/mnt/storage/makereadyos-uploads");
    const validateResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/storage/validate") && response.request().method() === "POST",
    );
    await page.getByTestId("storage-validate-button").click();
    await expect((await validateResponse).status()).toBe(200);
    await expect(page.getByTestId("storage-validation-result")).toContainText("Path looks safe");
    await expect(page.getByTestId("storage-validation-result")).toContainText("./move-uploads.sh /mnt/storage/makereadyos-uploads");
    await expect(page.getByTestId("storage-property-routing")).toContainText("Property upload folders");
    const routingRow = page.locator(".storage-routing-row").filter({ hasText: "TA" }).first();
    await routingRow.getByLabel(/Upload routing mode/).selectOption("PROPERTY_SUBDIR");
    await routingRow.getByLabel(/Upload folder/).fill("ta-inspections");
    const routingResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/storage/property-routing") && response.request().method() === "PATCH",
    );
    await routingRow.getByRole("button", { name: "Save" }).click();
    await expect((await routingResponse).status()).toBe(200);
    await expect(routingRow).toContainText("New uploads route to /ta-inspections");
  });

  test("admin can create a scoped API token from Integrations", async ({ page }) => {
    const tokenName = uniqueTag("QA API Token");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("integrations-panel")).toBeVisible();
    await page.getByTestId("api-token-name").fill(tokenName);
    await page.getByTestId("api-token-scope-read-items").check();
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/integrations/api-tokens") && response.request().method() === "POST",
    );
    await page.getByTestId("api-token-create").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("api-token-once")).toHaveValue(/mro_/);
    await expect(page.getByTestId("integrations-panel")).toContainText(tokenName);
  });

  test("admin can register a webhook and inspect delivery health", async ({ page }) => {
    const webhookName = uniqueTag("QA Webhook");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("integrations-panel")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-created")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-updated")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-resolved")).toBeVisible();
    await expect(page.getByTestId("webhook-event-lease-issue-archived")).toBeVisible();
    await page.getByTestId("webhook-name").fill(webhookName);
    await page.getByTestId("webhook-url").fill("https://example.com/makereadyos/webhook");
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/integrations/webhooks") && response.request().method() === "POST",
    );
    await page.getByTestId("webhook-create").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("webhook-secret-once")).toHaveValue(/wh_/);
    const row = page.getByTestId("webhook-row").filter({ hasText: webhookName });
    await expect(row).toContainText("READY");
    const dryRunResponse = page.waitForResponse((response) =>
      response.url().includes("/test-payload") && response.request().method() === "POST",
    );
    await row.getByRole("button", { name: "Dry-run test" }).click();
    await expect((await dryRunResponse).status()).toBe(201);
    await row.getByTestId("webhook-deliveries-toggle").click();
    await expect(page.getByTestId("webhook-delivery-panel")).toContainText("DRY_RUN");
  });

  test("admin can open and filter the activity log", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-activity").click();
    await expect(page.getByTestId("activity-panel")).toBeVisible();
    await expect(page.getByTestId("activity-table")).toBeVisible();
    await page.getByTestId("activity-filter-action").selectOption("AUTH_LOGIN_SUCCESS");
    await expect(page.getByTestId("activity-row").first()).toContainText("Auth Login Success");
  });

  test("admin can open the structured automation workspace", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await expect(page.getByTestId("automation-panel")).toBeVisible();
    await expect(page.getByText("JavaScript is never executed.")).toBeVisible();
    await expect(page.getByTestId("automation-run-history")).toBeVisible();
    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-preview-stored").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();
    await expect(page.getByTestId("automation-preview-notice")).toContainText("No changes will be made");
  });

  test("admin can preview and install a disabled operational rule template", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await expect(page.getByTestId("automation-template-library")).toBeVisible();
    await expect(page.getByTestId("automation-template-requirements-pest-follow-up-needed")).toContainText("Pest Follow-Up Date");
    await page.getByTestId("automation-template-category").selectOption("Scheduling");
    await expect(page.getByTestId("automation-template-no-weekend-make-ready")).toBeVisible();
    await expect(page.getByTestId("automation-template-no-monday-friday-make-ready")).toBeVisible();
    await expect(page.getByTestId("automation-template-turn-date-sequence-review")).toBeVisible();
    await page.getByTestId("automation-template-category").selectOption("Planning");
    await expect(page.getByTestId("automation-template-daily-schedule-load-review")).toBeVisible();
    await expect(page.getByTestId("automation-template-in-house-or-vendor-work-routing")).toBeVisible();
    await page.getByTestId("automation-template-category").selectOption("Priority");
    await expect(page.getByTestId("automation-template-major-scope-priority")).toBeVisible();
    await expect(page.getByTestId("automation-template-overdue-make-ready")).toHaveCount(0);

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-template-preview-major-scope-priority").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();

    await expect(page.getByTestId("automation-template-enable")).not.toBeChecked();
    const installButton = page.getByTestId("automation-template-install-major-scope-priority");
    if (await installButton.isEnabled()) {
      const installResponse = page.waitForResponse((response) =>
        response.url().includes("/api/automations/templates/major-scope-priority/install") && response.request().method() === "POST",
      );
      await installButton.click();
      await expect((await installResponse).status()).toBe(201);
    }
    await expect(page.getByTestId("automation-template-major-scope-priority")).toContainText("Installed");
    await expect(page.getByText("Installed template Major Scope Priority Flag")).toBeVisible();
  });

  test("admin can preview and install an operational library pack", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await expect(page.getByTestId("operational-library")).toBeVisible();
    await expect(page.getByTestId("library-pack-make-ready-operations-starter")).toContainText("Make Ready Operations Starter");

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operational-library/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("library-pack-use-make-ready-operations-starter").click();
    await page.getByTestId("library-import-preview").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("library-preview-summary")).toContainText("Automation Templates");

    const installResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operational-library/install") && response.request().method() === "POST",
    );
    await page.getByTestId("library-import-install").click();
    if (await page.getByTestId("confirm-dialog").isVisible()) await page.getByTestId("confirm-dialog-confirm").click();
    await expect((await installResponse).status()).toBe(200);
    await expect(page.getByText("Installed operational library items")).toBeVisible();
  });

  test("admin can create and dry-run apply a property template", async ({ page }) => {
    const templateName = uniqueTag("QA Property Template");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await expect(page.getByTestId("property-template-library")).toBeVisible();
    await page.getByTestId("property-template-name").fill(templateName);
    await page.getByTestId("property-template-category").fill("Make Ready");

    const previewCreateResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-templates/from-property/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("property-template-preview-create").click();
    await expect((await previewCreateResponse).status()).toBe(200);
    await expect(page.getByTestId("property-template-preview-summary")).toContainText("Create template preview");

    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-templates/from-property") && response.request().method() === "POST",
    );
    await page.getByTestId("property-template-create-submit").click();
    await expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId("property-template-library")).toContainText(templateName);

    await page.getByTestId("property-template-apply-template").selectOption({ label: templateName });
    const applyPreviewResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/property-templates\/[^/]+\/apply$/) !== null && response.request().method() === "POST",
    );
    await page.getByTestId("property-template-apply-preview").click();
    await expect((await applyPreviewResponse).status()).toBe(200);
    await expect(page.getByTestId("property-template-preview-summary")).toContainText("Apply dry run");
  });

  test("admin can build and preview a scheduled condition from a custom date field", async ({ page }) => {
    const fieldLabel = `QA Automation Date ${Date.now()}`;

    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-fields").click();
    await page.getByTestId("custom-field-new").click();
    await page.getByTestId("custom-field-label").fill(fieldLabel);
    await page.getByTestId("custom-field-type").selectOption("DATE");
    await page.getByTestId("custom-field-save").click();

    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await page.getByTestId("automation-new").click();
    await page.getByTestId("automation-name").fill(`QA Custom Date Rule ${Date.now()}`);
    await page.getByTestId("automation-trigger").selectOption("SCHEDULED_CHECK");
    await page.getByTestId("automation-condition-field-0").selectOption({ label: fieldLabel });
    await expect(page.getByTestId("automation-condition-operator-0")).toHaveValue("dateBeforeToday");
    await page.getByTestId("automation-condition-operator-0").selectOption("equals");
    await expect(page.getByTestId("automation-condition-value-0")).toHaveAttribute("type", "date");
    await page.getByTestId("automation-condition-operator-0").selectOption("dateBeforeToday");

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-preview-draft").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();
  });

  test("admin can run a scheduled automation check and see manual history", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await expect(page.getByTestId("automation-panel")).toBeVisible();

    await page.getByRole("button", { name: /Scheduled move-in soon check/ }).click();
    await expect(page.getByTestId("automation-run-now")).toBeVisible();
    const runResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/automations\/[^/]+\/run$/) !== null && response.request().method() === "POST",
    );
    await page.getByTestId("automation-run-now").click();
    await expect((await runResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-run-history").getByText("MANUAL").first()).toBeVisible();
  });

  test("admin can preview and install least-loaded staff automation starters as review-first rules", async ({ page }) => {
    const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
    await login(page, adminEmail, adminPassword);
    const sessionResponse = await session;
    const apiOrigin = new URL(sessionResponse.url()).origin;
    const { csrfToken } = await sessionResponse.json();
    const create = async (path: string, data: Record<string, unknown>) => {
      const response = await page.request.post(`${apiOrigin}/api${path}`, { headers: { "x-csrf-token": csrfToken }, data });
      expect(response.status(), await response.text()).toBe(201);
      return response.json();
    };
    const { property } = await create("/operations/properties", { code: `QAAS${Date.now()}`, name: "QA Assignment Preview" });
    const { unit } = await create("/operations/units", { propertyId: property.id, number: "ASSIGN-101" });
    const metaResponse = await page.request.get(`${apiOrigin}/api/meta`);
    expect(metaResponse.status()).toBe(200);
    const { boardSections } = await metaResponse.json();
    const section = boardSections.find((entry: { propertyId: string; sectionType: string }) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
    expect(section).toBeTruthy();
    await create("/make-ready-items", {
      propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number,
      makeReadyDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), completionStatus: "NO",
    });
    // The fixture has a matching turn but no staff, independent of seeded board edits.
    await page.reload();
    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await expect(page.getByTestId("automation-panel")).toBeVisible();

    await page.getByTestId("automation-template-category").selectOption("Assignment");
    await page.getByTestId("automation-template-property").selectOption(property.id);
    await expect(page.getByTestId("automation-template-balanced-tech-auto-assignment")).toBeVisible();
    await expect(page.getByTestId("automation-template-auto-assign-cleaner-balanced")).toBeVisible();
    await expect(page.getByTestId("automation-template-enable")).not.toBeChecked();

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-template-preview-balanced-tech-auto-assignment").click();
    await expect((await previewResponse).status()).toBe(200);
    await expect(page.getByTestId("automation-preview-panel")).toBeVisible();
    await expect(page.getByTestId("automation-preview-panel")).toContainText("This rule is disabled. Preview evaluates it as if enabled.");
    await expect(page.getByTestId("automation-preview-panel")).toContainText("No active eligible staff were available for this property.");
    await expect(page.getByTestId("assignment-rollout-pack")).toBeVisible();
    await expect(page.getByTestId("assignment-rollout-pack")).toContainText("Keep review-only by default");
    await expect(page.getByTestId("copy-assignment-validation-notes")).toBeVisible();

    const installResponse = page.waitForResponse((response) =>
      response.url().includes("/api/automations/templates/balanced-tech-auto-assignment/install") && response.request().method() === "POST",
    );
    await page.getByTestId("automation-template-install-balanced-tech-auto-assignment").click();
    await expect((await installResponse).status()).toBe(201);
    await expect(page.getByTestId("automation-template-balanced-tech-auto-assignment")).toContainText("Installed");
    await expect(page.getByTestId("automation-template-enable")).not.toBeChecked();
  });

  test("admin can open planning and create a work block", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-planning").click();
    await expect(page.getByTestId("planning-panel")).toBeVisible();
    const planningBoxes = await page.locator(".planning-create label").evaluateAll((labels) => labels.map((label) => {
      const rect = label.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    for (let index = 1; index < planningBoxes.length; index += 1) {
      expect(planningBoxes[index].left).toBeGreaterThanOrEqual(planningBoxes[index - 1].left);
    }
    await page.getByTestId("planning-assigned-user").selectOption({ index: 1 });
    await page.getByPlaceholder("Search unit...", { exact: true }).fill("284");
    await page.getByRole("listbox").getByRole("button", { name: /^(?:TA )?284(?: \/|$)/ }).click();
    await page.getByTestId("planning-date").fill(todayUtc());
    const response = page.waitForResponse((result) => result.url().includes("/api/planning/blocks") && result.request().method() === "POST");
    await page.getByTestId("planning-create-submit").click();
    await expect((await response).status()).toBe(201);
    await expect(page.locator("[data-testid^='planning-block-']").first()).toBeVisible();
  });

  test("admin can open the refrigerant workspace and inspect core tabs", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("module-rail-refrigerant").click();
    await expect(page.getByTestId("refrigerant-panel")).toBeVisible();
    await expect(page.getByTestId("refrigerant-overview-metrics")).toBeVisible();
    await page.getByTestId("refrigerant-tab-virgin").click();
    await expect(page.getByTestId("refrigerant-panel")).toContainText("Virgin Tanks");
    await page.getByTestId("refrigerant-tab-history").click();
    await expect(page.getByTestId("refrigerant-panel")).toContainText("Recent Refrigerant Activity");
    await page.getByTestId("refrigerant-tab-exports").click();
    const builder = page.getByTestId("refrigerant-report-builder");
    await expect(builder.getByRole("link")).toHaveCount(1);
    await expect(page.getByTestId("refrigerant-report-contents")).toHaveValue("fullAudit");
    const generate = page.getByTestId("refrigerant-report-generate");
    await expect(generate).toHaveAttribute("href", /report\.pdf\?report=fullAudit/);
    await expect(builder).toContainText("Tank inventory is shared across properties");
    await page.getByTestId("refrigerant-report-format").selectOption("csv");
    await expect(generate).toHaveAttribute("href", /export\.csv\?report=fullAudit/);
    await page.getByTestId("refrigerant-report-contents").selectOption("usage");
    await expect(generate).toHaveAttribute("href", /export\.csv\?report=usage/);
    await page.getByTestId("refrigerant-report-format").selectOption("excel");
    await expect(generate).toHaveAttribute("href", /export\.xls\?report=usage/);
    await expect(builder).not.toContainText("Tank inventory is shared across properties");
    const propertySelect = page.getByTestId("refrigerant-report-property");
    const [selectedProperty] = await propertySelect.selectOption({ index: 1 });
    expect(new URL((await generate.getAttribute("href"))!, page.url()).searchParams.get("propertyId")).toBe(selectedProperty);
    await expect(page.getByTestId("refrigerant-report-scope")).toContainText(await propertySelect.locator("option:checked").innerText());
    await propertySelect.selectOption("");
    expect(new URL((await generate.getAttribute("href"))!, page.url()).searchParams.has("propertyId")).toBe(false);
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(generate).toBeVisible();
    expect(await builder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });

  test("admin can create a pool log, open report tools, and upload a pool photo", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("module-rail-pool").click();
    await expect(page.getByTestId("pool-log-panel")).toBeVisible();
    await expect(page.getByTestId("pool-report-printable")).toBeVisible();
    await expect(page.getByTestId("pool-export-csv")).toBeVisible();
    await page.getByRole("combobox", { name: "Pool log property" }).selectOption({ index: 1 });

    await page.getByTestId("pool-tab-setup").click();
    await page.getByTestId("pool-facility-name").fill(uniqueTag("QA Pool"));
    const facilityResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/facilities") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-facility-submit").click();
    await expect((await facilityResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-chemicals").click();
    const chemicalName = uniqueTag("QA Cal-Hypo");
    await page.getByTestId("pool-chemical-name").fill(chemicalName);
    const chemicalResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/chemicals") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-chemical-submit").click();
    await expect((await chemicalResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-daily").click();
    await page.getByTestId("pool-reading-ph").fill("8.1");
    await page.getByTestId("pool-reading-free-chlorine").fill("0.4");
    await page.getByTestId("pool-safety-0").selectOption("FAIL");
    await page.locator('select[name="chemicalId"]').selectOption({ label: chemicalName });
    await page.getByTestId("pool-chemical-ounces").fill("70");
    const entryResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/entries") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-daily-submit").click();
    await expect((await entryResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-history").click();
    await expect(page.getByTestId("pool-history-row").first()).toBeVisible();
    await expect(page.getByTestId("pool-history-row").first()).toContainText("4 lb 6 oz");
    const uploadResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/pool\/entries\/[^/]+\/attachments$/) !== null && response.request().method() === "POST",
    );
    await page.getByTestId("pool-attachment-upload").first().setInputFiles({
      name: "pool-check-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("MakeReadyOS pool photo smoke"),
    });
    await expect((await uploadResponse).status()).toBe(201);
    await expect(page.getByTestId("pool-history-row").first()).toContainText("pool-check-photo.png");
  });

  test("admin can launch pest control from board cells and drawer actions with make-ready context", async ({ page }) => {
    await login(page, adminEmail, adminPassword);

    const pestCell = page.locator("[data-testid^='builtin-cell-pestStatus-']").first();
    await expect(pestCell).toBeVisible();
    await pestCell.click();
    await expect(page.locator(".pest-control-panel")).toBeVisible();
    await expect(page.getByText("Showing pest requests linked to the selected make-ready item only.")).toBeVisible();

    await page.getByTestId("tab-table").click();
    await expect(page.getByTestId("board-table-view")).toBeVisible();
    await page.locator("[data-testid^='item-details-']").first().click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await expect(page.getByTestId("drawer-pest-context")).toBeVisible();
    await page.getByRole("button", { name: "Create Pest Request" }).click();
    await page.getByTestId("item-drawer-close").click();
    await expect(page.getByTestId("item-drawer")).toHaveCount(0);
    await expect(page.locator(".pest-control-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quick Add Pest Request" })).toBeVisible();
    await expect(page.getByText("Showing pest requests linked to the selected make-ready item only.")).toBeVisible();
    const quickAddForm = page.locator(".pest-control-panel form").first();
    await expect(quickAddForm.locator("select[name='source']")).toHaveValue("Make Ready");

    const pestTag = uniqueTag("QA Pest Link");
    await quickAddForm.locator("input[name='area']").fill(`${pestTag} Area`);
    await quickAddForm.locator("select[name='pestType']").selectOption("Roaches");
    await quickAddForm.locator("input[name='additionalPestType']").fill(pestTag);
    await quickAddForm.locator("textarea[name='description']").fill(`${pestTag} notes`);
    const createResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pest/issues") && response.request().method() === "POST",
    );
    await quickAddForm.getByRole("button", { name: "Quick Add Pest Request" }).click();
    const savedResponse = await createResponse;
    expect(savedResponse.status()).toBe(201);
    const savedIssue = (await savedResponse.json()).issue;
    expect(savedIssue.makeReadyItemId).toBeTruthy();

    await page.getByRole("button", { name: "Make Ready" }).click();
    const linkedIssue = page.locator("[data-testid^='pest-issue-']").filter({ hasText: pestTag }).first();
    await expect(linkedIssue).toBeVisible();
    await expect(linkedIssue).toHaveAttribute("data-testid", `pest-issue-${savedIssue.id}`);
  });

  test("admin can create and search property wiki content", async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("module-rail-property-wiki").click();
    await expect(page.getByTestId("property-wiki-panel")).toBeVisible();

    const wiki = page.getByTestId("property-wiki-panel");
    await wiki.getByLabel("Address", { exact: true }).fill("500 QA Property Wiki Lane");
    const profileResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/profile") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save Overview" }).click();
    await expect((await profileResponse).status()).toBe(200);

    await wiki.getByRole("button", { name: "Utilities", exact: true }).click();
    const utilityTitle = uniqueTag("QA Utility Shutoff");
    await wiki.getByLabel("Title", { exact: true }).fill(utilityTitle);
    const utilityResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/entries") && response.request().method() === "POST",
    );
    await wiki.getByRole("button", { name: "Create Record", exact: true }).click();
    await expect((await utilityResponse).status()).toBe(201);
    await expect(wiki.locator(".property-wiki-record").filter({ hasText: utilityTitle })).toBeVisible();

    await wiki.getByRole("button", { name: "Vendors", exact: true }).click();
    const vendorName = uniqueTag("QA Wiki Vendor");
    await wiki.getByLabel("Company", { exact: true }).fill(vendorName);
    const vendorResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/vendors") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create Vendor" }).click();
    await expect((await vendorResponse).status()).toBe(201);
    await expect(wiki.locator(".property-wiki-record").filter({ hasText: vendorName })).toBeVisible();

    await wiki.getByRole("button", { name: "Documents", exact: true }).click();
    const assetResponse = page.waitForResponse((response) =>
      response.url().includes("/api/property-wiki/assets/upload") && response.request().method() === "POST",
    );
    await wiki.getByLabel("Title", { exact: true }).fill(`${vendorName} Manual`);
    await wiki.locator('input[type="file"]').setInputFiles({
      name: "property-wiki-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("MakeReadyOS property wiki smoke"),
    });
    await expect((await assetResponse).status()).toBe(201);
    await expect(wiki.locator(".property-wiki-record").filter({ hasText: `${vendorName} Manual` })).toContainText("property-wiki-note.txt");

    await page.getByTestId("property-wiki-search-input").fill("shutoff");
    await page.getByTestId("property-wiki-search-submit").click();
    await expect(wiki.locator(".property-wiki-search-results")).toContainText(utilityTitle);
  });

  test("demo tech does not see admin tab", async ({ page }) => {
    await login(page, techEmail, techPassword);
    await expect(page.getByTestId("tab-admin")).toHaveCount(0);
    await expect(page.getByTestId("tab-activity")).toHaveCount(0);
    await expect(page.getByTestId("tab-automations")).toHaveCount(0);
    await expect(page.getByTestId("onboarding-open")).toHaveCount(0);
    await expect(page.getByTestId("saved-views-panel")).toHaveCount(0);
    await expect(page.locator(".module-rail")).toBeVisible();
    await expect(page.getByTestId("table-add-field-shortcut")).toHaveCount(0);
    await expect(page.getByTestId("tab-my-work")).toBeVisible();
    await page.getByTestId("tab-my-work").click();
    await expect(page.getByTestId("my-work-panel")).toBeVisible();
  });

  test("cleared session returns user to login", async ({ page, context }) => {
    await login(page, adminEmail, adminPassword);
    await context.clearCookies();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
