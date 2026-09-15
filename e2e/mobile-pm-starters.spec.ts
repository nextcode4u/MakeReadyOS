import { expect, test } from "@playwright/test";

test("PM starters schedule directory units and preserve recurrence without duplicates", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const propertyId = await page.getByTestId("property-filter").locator("option").nth(1).getAttribute("value");
  const headers = { "x-csrf-token": (await (await page.request.get("/api/auth/me")).json()).csrfToken };
  const post = (path: string, data: object) => page.request.post(`/api${path}`, { headers, data });
  for (const number of ["PM-001", "PM-002", "PM-003"]) {
    const response = await post("/operations/units", { propertyId, number });
    expect(response.status(), await response.text()).toBe(201);
  }
  const preview = await post("/pm/starters/preview", { propertyId, from: "2026-10-01", to: "2026-12-31", weekdays: [1, 2, 3, 4, 5] });
  expect(preview.ok(), await preview.text()).toBe(true);
  const { plan } = await preview.json();
  expect(plan.length).toBeGreaterThanOrEqual(3);
  const input = { propertyId, key: "unit-inspection", enabled: true, frequency: "Quarterly", firstDueDate: "2026-10-01", unitDates: plan.map((p: any) => ({ unitId: p.unitId, dueDate: p.dueDate })) };
  for (let n = 0; n < 2; n++) {
    const result = await post("/pm/starters/apply", input);
    expect(result.ok(), await result.text()).toBe(true);
  }
  const templates = async () => (await (await page.request.get(`/api/pm/templates?propertyId=${propertyId}`)).json()).templates;
  const inspections = (await templates()).filter((t: any) => t.starterKey?.startsWith("unit-inspection:"));
  expect(inspections).toHaveLength(plan.length);
  const backup = await (await page.request.get("/api/admin/export")).json();
  const portable = backup.data.preventiveMaintenanceTemplates.filter((t: any) => t.starterKey === "unit-inspection");
  expect(portable).toHaveLength(plan.length);
  expect(portable.every((t: any) => t.unitNumber && t.firstDueDate)).toBe(true);
  const restore = await post("/admin/import", { backup: { ...backup, data: { ...Object.fromEntries(Object.keys(backup.data).map(section => [section, []])), preventiveMaintenanceTemplates: portable } }, dryRun: false });
  expect(restore.ok(), await restore.text()).toBe(true);
  expect((await restore.json()).summary.preventiveMaintenanceTemplates.created).toBe(0);
  const tasks = async () => (await (await page.request.get(`/api/pm/tasks?propertyId=${propertyId}&limit=500`)).json()).tasks;
  const first = (await tasks()).find((t: any) => t.templateId === inspections.find((p: any) => p.unitId === plan[0].unitId).id);
  expect(first.dueDate.slice(0, 10)).toBe("2026-10-01");
  const complete = await post(`/pm/tasks/${first.id}/complete`, { outcome: "PASS", notes: "Inspected; no issues." });
  expect(complete.ok(), await complete.text()).toBe(true);
  const repeated = await post(`/pm/tasks/${first.id}/complete`, { outcome: "PASS", notes: "Repeat" });
  expect(repeated.status()).toBe(409);
  const next = (await tasks()).filter((t: any) => t.templateId === first.templateId && !["COMPLETED", "SKIPPED"].includes(t.status));
  expect(next).toHaveLength(1);
  expect(next[0].dueDate.slice(0, 10)).toBe("2027-01-01");
  expect((await post("/pm/starters/apply", { ...input, enabled: false })).ok()).toBe(true);
  expect((await post(`/pm/tasks/${next[0].id}/complete`, { outcome: "PASS", notes: "Paused schedule completion" })).ok()).toBe(true);
  expect((await tasks()).filter((t: any) => t.templateId === first.templateId && !["COMPLETED", "SKIPPED"].includes(t.status))).toHaveLength(0);
  const invalid = await post("/pm/starters/apply", { ...input, unitDates: [{ unitId: "outside-property", dueDate: "2026-10-01" }] });
  expect(invalid.status()).toBe(409);
  await page.getByTestId("module-rail-pm").click();
  const panel = page.getByTestId("preventive-maintenance-panel");
  await panel.locator(".module-actions select").selectOption(propertyId!);
  const starter = page.getByTestId("pm-starters");
  await starter.locator("summary").click();
  await starter.getByLabel("Inspection / log").selectOption("lighting");
  await starter.getByLabel("First due date").fill("2026-11-05");
  await starter.getByRole("button", { name: /Enable schedule for/ }).click();
  await expect(starter.getByRole("status")).toContainText("Schedule saved");
  await starter.getByLabel("Inspection / log").selectOption("unit-inspection");
  await starter.getByLabel("Inspection window starts").fill("2026-10-01");
  await starter.getByLabel("Inspection window ends").fill("2026-12-31");
  await starter.getByRole("button", { name: "Preview unit dates" }).click();
  await expect(starter.getByRole("table")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await starter.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
