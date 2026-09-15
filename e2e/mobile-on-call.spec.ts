import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("on-call separates public schedules, protected guides and staff editing", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const origin = new URL(page.url()).origin;
  const { csrfToken } = await (await page.request.get("/api/auth/me")).json();
  const headers = { "x-csrf-token": csrfToken };
  const existing = await (await page.request.get("/api/on-call")).json();
  const people = ["Primary", "Backup", "External tech"].map(name => ({ id: randomUUID(), name, publicPhone: "555-0100" }));
  const properties = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: `Covered property ${i + 1}`, address: "PROTECTED-ADDRESS", shopLocation: `PROTECTED-SHOP-${i}`, accessCodes: `PROTECTED-CODE-${i}`, instructions: `PROTECTED-GUIDE-${i}`, mapUrl: "https://example.com/protected-map", guideUrl: "https://example.com/protected-guide" }));
  const data = { title: "Five-property on-call", timeZone: "America/Chicago", people, properties, shifts: [{ id: randomUUID(), personId: people[0].id, backupId: people[1].id, propertyIds: properties.map(property => property.id), start: new Date(Date.now() - 3600000).toISOString(), end: new Date(Date.now() + 86400000).toISOString(), notes: "Public shift note" }] };
  const save = async (body: unknown, status = 200) => { const result = await page.request.put("/api/on-call", { headers, data: body }); expect(result.status(), await result.text()).toBe(status); return result.json(); };
  await save({ version: existing.version, data, externalEnabled: true }, 400);
  let saved = await save({ version: existing.version, data, externalEnabled: true, accessCode: "Shared-Only-123456" });
  await save({ version: existing.version, data, externalEnabled: true }, 409);
  await save({ version: saved.version, data: { ...data, people: [] }, externalEnabled: true }, 400);
  await page.getByTestId("module-rail-oncall").click();
  const panel = page.getByTestId("on-call-panel");
  await expect(panel.getByRole("heading", { name: data.title })).toBeVisible();
  await panel.getByRole("button", { name: "Manage on-call" }).click();
  await panel.getByLabel("Schedule title").fill("Edited on-call");
  await page.route("**/api/on-call", route => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { message: "Test save failure" } }) : route.continue());
  await panel.getByRole("button", { name: "Save on-call", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Test save failure");
  await expect(panel.getByLabel("Schedule title")).toHaveValue("Edited on-call");
  await page.unroute("**/api/on-call");
  await panel.getByRole("button", { name: "Save on-call", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("On-call saved");
  saved = await (await page.request.get("/api/on-call")).json();
  const backup = await (await page.request.get("/api/admin/export")).json();
  expect(backup.data.onCallWorkspaces).toEqual([saved.data]);
  expect(JSON.stringify(backup.data.onCallWorkspaces)).not.toContain("Shared-Only-123456");
  const preview = await page.request.post("/api/admin/import", { headers, data: { dryRun: true, mode: "merge", backup } });
  expect(preview.ok(), await preview.text()).toBeTruthy();
  expect((await preview.json()).summary.onCallWorkspaces.skipped).toBe(1);
  await panel.getByRole("button", { name: "Close editor" }).click();
  await expect(panel.getByRole("button", { name: "Copy share link" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(`${origin}/on-call/`);
    await expect(guestPage.getByRole("heading", { name: "Edited on-call" })).toBeVisible();
    await expect(guestPage.getByTestId("property-filter")).toHaveCount(0);
    await expect(guestPage.getByRole("button", { name: "Manage on-call" })).toHaveCount(0);
    const visible = await guest.request.get(`${origin}/api/on-call/share`);
    expect(visible.headers()["cache-control"]).toContain("no-store");
    expect(await visible.text()).not.toContain("PROTECTED");
    expect(await (await guest.request.get(`${origin}/api/on-call/share`)).text()).not.toContain("protected-map");
    expect((await guest.request.get(`${origin}/api/make-ready-items`)).status()).toBe(401);
    expect((await guest.request.put(`${origin}/api/on-call`, { data: {} })).status()).toBe(401);
    expect((await guest.request.post(`${origin}/api/on-call/unlock`, { data: { code: "Shared-Only-123456" } })).status()).toBe(403);
    await guestPage.getByLabel("Access code", { exact: true }).fill("wrong-code");
    await guestPage.getByRole("button", { name: "Unlock property guides" }).click();
    await expect(guestPage.getByRole("alert")).toContainText("Incorrect access code");
    await guestPage.getByLabel("Access code", { exact: true }).fill("Shared-Only-123456");
    await guestPage.getByRole("button", { name: "Unlock property guides" }).click();
    await expect(guestPage.getByRole("button", { name: "Lock property guides" })).toBeVisible();
    await guestPage.locator("summary").filter({ hasText: "Covered property 1" }).click();
    await expect(guestPage.getByText("PROTECTED-CODE-0", { exact: true })).toBeVisible();
    await expect(guestPage.getByRole("link", { name: "Open property map" }).first()).toHaveAttribute("rel", "noopener noreferrer");
    expect((await guest.request.get(`${origin}/api/on-call`)).status()).toBe(401);
    expect((await guest.request.get(`${origin}/api/admin/users`)).status()).toBe(401);
    await expect.poll(() => guestPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await guestPage.screenshot({ path: testInfo.outputPath("on-call-external-mobile.png"), fullPage: true });
    await guestPage.setViewportSize({ width: 1440, height: 1000 });
    await guestPage.screenshot({ path: testInfo.outputPath("on-call-external-desktop.png"), fullPage: true });
    saved = await save({ version: saved.version, data: saved.data, externalEnabled: true, accessCode: "Rotated-Only-654321" });
    const revoked = await (await guest.request.get(`${origin}/api/on-call/share`)).json();
    expect(revoked.unlocked).toBe(false); expect(JSON.stringify(revoked)).not.toContain("PROTECTED");
    await guestPage.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(guestPage.getByText("PROTECTED-CODE-0", { exact: true })).toHaveCount(0);
    await guestPage.getByLabel("Access code", { exact: true }).fill("Rotated-Only-654321");
    await guestPage.getByRole("button", { name: "Unlock property guides" }).click();
    await guestPage.getByRole("button", { name: "Lock property guides" }).click();
    await expect(guestPage.getByRole("button", { name: "Unlock property guides" })).toBeEnabled();
    expect((await (await guest.request.get(`${origin}/api/on-call/share`)).json()).unlocked).toBe(false);
    for (let i = 0; i < 11; i++) {
      const response = await guest.request.post(`${origin}/api/on-call/unlock`, { headers: { Origin: origin }, data: { code: "not-correct" } });
      if (i === 10) expect(response.status()).toBe(429);
    }
    saved = await save({ version: saved.version, data: saved.data, externalEnabled: false });
    expect((await guest.request.get(`${origin}/api/on-call/share`)).status()).toBe(404);
  } finally { await guest.close(); }
  for (const role of ["TECH", "LEASING", "CLEANER", "VIEWER", "MANAGER"]) {
    const username = `oncall-${role.toLowerCase()}-${Date.now()}`;
    const password = "Fixture-Only-123456";
    const create = await page.request.post("/api/admin/users", { headers, data: { username, fullName: `On-call ${role}`, role, propertyIds: [], password } });
    expect(create.ok(), await create.text()).toBeTruthy();
    const context = await browser.newContext();
    try {
      const login = await context.request.post(`${origin}/api/auth/login`, { data: { identifier: username, password } });
      expect(login.ok(), await login.text()).toBeTruthy();
      const token = (await login.json()).csrfToken;
      const view = await context.request.get(`${origin}/api/on-call`);
      expect(view.status()).toBe(200); expect(await view.text()).toContain("PROTECTED-CODE-0");
      const edit = await context.request.put(`${origin}/api/on-call`, { headers: { "x-csrf-token": token }, data: { version: saved.version, data: saved.data, externalEnabled: false } });
      expect(edit.status(), await edit.text()).toBe(role === "MANAGER" ? 200 : 403);
      if (role === "MANAGER") saved = await edit.json();
    } finally { await context.close(); }
  }
});
