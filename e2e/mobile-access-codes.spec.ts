import { expect, test } from "@playwright/test";

test("unit access directory imports safely, syncs turn codes and restricts painter permissions", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const headers = { "x-csrf-token": (await (await page.request.get(`${origin}/api/auth/me`)).json()).csrfToken };
  const send = async (method: string, path: string, data?: unknown) => {
    const response = await page.request.fetch(`${origin}/api${path}`, { method, headers, data });
    expect(response.ok(), await response.text()).toBe(true); return response.json();
  };
  const stamp = Date.now();
  const { property } = await send("POST", "/operations/properties", { code: `KEY${stamp}`, name: "Access codes test" });
  const { property: other } = await send("POST", "/operations/properties", { code: `OTHER${stamp}`, name: "Other property" });
  const { unit } = await send("POST", "/operations/units", { propertyId: property.id, number: "011" });
  const root = `/access-codes/${property.id}`;
  // Do not send an already-open screen's stale metadata into the property picker.
  await page.reload();
  await page.getByRole("button", { name: "Keys & Access", exact: true }).click();
  const panel = page.getByTestId("access-codes-panel");
  await panel.getByLabel("Property for code lookup").selectOption(property.id);
  await panel.getByText("Import / export unit keycodes", { exact: true }).click();
  await panel.getByLabel("Paste code directory").fill("unit,doorCode,accessCode,keyCode\n11,0042#,0099,A12\n999,1234,,");
  await panel.getByRole("button", { name: "Preview code import" }).click();
  await expect(panel.getByText("1 units to update: 011", { exact: true })).toBeVisible();
  const apply = panel.getByRole("button", { name: `Apply code import to ${property.code}` });
  await expect(apply).toBeDisabled();
  await panel.getByLabel("Skip invalid rows and import valid units only").check();
  await apply.click();
  await expect(panel.getByRole("status")).toHaveText("Access-code directory updated.");
  const metadata = await send("GET", root);
  expect(JSON.stringify(metadata)).not.toContain("0042#");
  await panel.getByLabel("Unit for code lookup").selectOption(unit.id);
  const mailbox = panel.getByTestId("access-mailbox");
  await expect(mailbox).toContainText("Not recorded");
  await mailbox.getByRole("button", { name: "Add mailbox assignment" }).click();
  await mailbox.getByLabel("Mailbox number", { exact: true }).fill("001-A");
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("mail provider");
    expect(dialog.message()).toContain("New mailbox: 001-A");
    await dialog.dismiss();
  });
  await mailbox.getByRole("button", { name: "Save mailbox assignment" }).click();
  expect((await send("GET", root)).units.find((entry: any) => entry.id === unit.id).mailboxNumber).toBeNull();
  page.once("dialog", dialog => dialog.accept());
  await mailbox.getByRole("button", { name: "Save mailbox assignment" }).click();
  await expect(mailbox.getByRole("status")).toHaveText("Unit mailbox assignment saved.");
  expect((await send("GET", `/mailboxes/${property.id}`)).units.find((entry: any) => entry.id === unit.id).mailboxNumber).toBe("001-A");
  await mailbox.getByRole("button", { name: "Change mailbox assignment" }).click();
  await mailbox.getByLabel("Mailbox number", { exact: true }).fill("002-B");
  await send("PATCH", `/mailboxes/${property.id}/${unit.id}`, { expected: "001-A", mailboxNumber: "003-C" });
  page.once("dialog", dialog => dialog.accept());
  await mailbox.getByRole("button", { name: "Save mailbox assignment" }).click();
  await expect(mailbox.getByRole("alert")).toContainText("Reload before saving");
  await mailbox.getByRole("button", { name: "Cancel / reload mailbox" }).click();
  await expect(mailbox.locator("strong")).toHaveText("003-C");
  await mailbox.getByRole("button", { name: "Change mailbox assignment" }).click();
  await mailbox.getByLabel("Mailbox number", { exact: true }).fill("");
  page.once("dialog", async dialog => {
    expect(dialog.message()).toContain("Current mailbox: 003-C");
    expect(dialog.message()).toContain("remove assignment");
    await dialog.accept();
  });
  await mailbox.getByRole("button", { name: "Save mailbox assignment" }).click();
  await expect(mailbox.locator("strong")).toHaveText("Not recorded");
  await panel.getByRole("button", { name: "Reveal unit codes" }).click();
  await expect(panel.getByLabel("Door code", { exact: true })).toHaveValue("0042#");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("keys-access-mobile.png") });
  const exported = await send("POST", `${root}/export`, {});
  expect(exported.rows[0]).toEqual({ unit: "011", doorCode: "0042#", accessCode: "0099", keyCode: "A12" });
  const wrongProperty = await page.request.post(`${origin}/api/access-codes/${other.id}/import`, { headers, data: { text: JSON.stringify(exported) } });
  expect(wrongProperty.status()).toBe(400);
  const meta = await send("GET", "/meta");
  const boardGroup = meta.boardSections.find((section: any) => section.propertyId === property.id && section.sectionType === "MAKE_READY").key;
  const item = await send("POST", "/make-ready-items", { propertyId: property.id, unitId: unit.id, unitNumber: unit.number, itemName: unit.number, boardGroup, vacancyStatus: "VACANT NOT LEASED NOT READY" });
  const turnPath = `/make-ready-items/${item.id}/resident-codes`;
  let turn = await send("GET", turnPath);
  expect(turn.value.residentDoorCode).toBe("0042#");
  const stale = await send("GET", `${root}/units/${unit.id}`);
  const preview = await send("POST", `${root}/import`, { text: "unit,doorCode,accessCode,keyCode\n011,NEW,,", overwrite: true });
  await send("PUT", turnPath, { version: turn.version, value: { ...turn.value, residentDoorCode: "0055#" } });
  expect((await send("GET", `${root}/units/${unit.id}`)).value.doorCode).toBe("0055#");
  expect((await page.request.put(`${origin}/api${root}/units/${unit.id}`, { headers, data: stale })).status()).toBe(409);
  expect((await page.request.post(`${origin}/api${root}/import`, { headers, data: { text: "unit,doorCode,accessCode,keyCode\n011,NEW,,", overwrite: true, token: preview.token } })).status()).toBe(409);
  const fresh = await send("GET", `${root}/units/${unit.id}`);
  await send("PUT", `${root}/units/${unit.id}`, { ...fresh, value: { ...fresh.value, doorCode: "0066#" } });
  turn = await send("GET", turnPath);
  expect(turn.value.residentDoorCode).toBe("0066#");
  expect(turn.value.technicianResults).toEqual({});
  const backup = await send("GET", "/admin/export");
  const savedUnit = backup.data.units.find((entry: any) => entry.propertyCode === property.code && entry.number === "011");
  expect(savedUnit.accessCodes.doorCode).toBe("0066#");
  const restored = await send("POST", "/admin/import", { dryRun: false, backup: { ...backup, data: { ...Object.fromEntries(Object.keys(backup.data).map(key => [key, []])), properties: backup.data.properties.filter((entry: any) => entry.code === property.code), units: [{ ...savedUnit, number: "022" }] } } });
  expect(restored.applied).toBe(true);
  const restoredUnit = (await send("GET", root)).units.find((entry: any) => entry.number === "022");
  expect((await send("GET", `${root}/units/${restoredUnit.id}`)).value.doorCode).toBe("0066#");
  const password = "Test-Only-Code!12345";
  for (const role of ["MANAGER", "TECH", "LEASING", "PAINTER", "CLEANER", "VIEWER"]) {
    const username = `${role.toLowerCase()}${stamp}`;
    const { user: staffUser } = await send("POST", "/admin/users", { username, fullName: `${role} ${stamp}`, role, propertyIds: [property.id], password });
    const context = await browser.newContext();
    try {
      const login = await context.request.post(`${origin}/api/auth/login`, { data: { identifier: username, password } });
      expect(login.ok(), await login.text()).toBe(true);
      const staffHeaders = { "x-csrf-token": (await login.json()).csrfToken };
      const allowed = ["MANAGER", "TECH", "LEASING"].includes(role);
      expect((await context.request.get(`${origin}/api${root}/units/${unit.id}`)).status()).toBe(allowed ? 200 : 403);
      if (allowed) {
        const directory = await (await context.request.get(`${origin}/api${root}`)).json();
        expect(directory.units.find((entry: any) => entry.id === unit.id)).toHaveProperty("mailboxNumber", null);
        expect(directory.canManage).toBe(role === "MANAGER");
      }
      if (role !== "MANAGER") expect((await context.request.patch(`${origin}/api/mailboxes/${property.id}/${unit.id}`, { headers: staffHeaders, data: { expected: null, mailboxNumber: "999" } })).status()).toBe(403);
      expect((await context.request.get(`${origin}/api/access-codes/${other.id}`)).status()).toBe(403);
      expect((await context.request.post(`${origin}/api${root}/export`, { headers: staffHeaders, data: {} })).status()).toBe(role === "MANAGER" ? 200 : 403);
      if (role !== "MANAGER") expect((await context.request.post(`${origin}/api${root}/import`, { headers: staffHeaders, data: { text: JSON.stringify(exported) } })).status()).toBe(403);
      if (["PAINTER", "CLEANER", "VIEWER"].includes(role)) {
        expect((await context.request.patch(`${origin}/api/admin/users/${staffUser.id}`, { headers: staffHeaders, data: { keycodeAccess: true } })).status()).toBe(403);
        const granted = await send("PATCH", `/admin/users/${staffUser.id}`, { keycodeAccess: true });
        expect(granted.user.keycodeAccess).toBe(role !== "VIEWER");
        expect((await context.request.get(`${origin}/api${root}/units/${unit.id}`)).status()).toBe(role === "VIEWER" ? 403 : 200);
        expect((await context.request.post(`${origin}/api${root}/export`, { headers: staffHeaders, data: {} })).status()).toBe(403);
        expect((await context.request.get(`${origin}/api/access-codes/${other.id}`)).status()).toBe(403);
        const me = await (await context.request.get(`${origin}/api/auth/me`)).json();
        expect(me.user.keycodeAccess).toBe(role !== "VIEWER");
        const staffPage = await context.newPage();
        await staffPage.goto(origin);
        await expect(staffPage.getByTestId("property-filter")).toBeVisible();
        await expect(staffPage.getByRole("button", { name: "Keys & Access", exact: true })).toHaveCount(role === "VIEWER" ? 0 : 1);
        await send("PATCH", `/admin/users/${staffUser.id}`, { keycodeAccess: false });
        expect((await context.request.get(`${origin}/api${root}/units/${unit.id}`)).status()).toBe(403);
        await staffPage.reload();
        await expect(staffPage.getByTestId("property-filter")).toBeVisible();
        await expect(staffPage.getByRole("button", { name: "Keys & Access", exact: true })).toHaveCount(0);
      }
      if (role === "PAINTER") {
        expect(meta.staff.some((staff: any) => staff.fullName === `${role} ${stamp}`)).toBe(false);
        const painterMeta = await (await context.request.get(`${origin}/api/meta`)).json();
        expect(painterMeta.staff.some((staff: any) => staff.fullName === `${role} ${stamp}`)).toBe(true);
        const paint = await context.request.patch(`${origin}/api/make-ready-items/${item.id}`, { headers: staffHeaders, data: { paintStatus: "DONE" } });
        expect(paint.ok(), await paint.text()).toBe(true);
        expect((await context.request.patch(`${origin}/api/make-ready-items/${item.id}`, { headers: staffHeaders, data: { makeReadyStatus: "DONE" } })).status()).toBe(403);
      }
    } finally { await context.close(); }
  }
  await page.getByRole("button", { name: /View:/ }).click();
  await page.getByTestId("tab-admin").click();
  await page.getByTestId("admin-create-role").selectOption("CLEANER");
  await expect(page.getByTestId("admin-create-keycode-access")).not.toBeChecked();
  await page.getByTestId("admin-create-role").selectOption("PAINTER");
  await expect(page.getByTestId("admin-create-keycode-access")).toBeVisible();
  await page.getByTestId("admin-create-role").selectOption("VIEWER");
  await expect(page.getByTestId("admin-create-keycode-access")).toHaveCount(0);
  await page.getByTestId(`admin-user-row-cleaner${stamp}`).getByRole("button", { name: "Edit account" }).click();
  await page.getByTestId("admin-edit-keycode-access").check();
  await page.getByTestId("admin-save-user-button").click();
  await expect.poll(async () => (await send("GET", "/admin/users")).users.find((user: any) => user.username === `cleaner${stamp}`).keycodeAccess).toBe(true);
});
