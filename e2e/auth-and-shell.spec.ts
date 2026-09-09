import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { frogSpriteClips } from "../apps/web/src/lib/frogSprites";
import { pondSoundNotes } from "../apps/web/src/lib/pondAudio";
import { gardenWaterings, localPondDate, pondDiscoveryHabitat, pondSecrets, pondSeason, pondWildlife, wildlifeVisible } from "../apps/web/src/lib/pondDiscoveries";
import { pondPixelArt } from "../apps/web/src/lib/pondPixelArt";
import { approachSnack, pondGreeting, pondJourney, pondLight, pondPads, pondPersonality, selectPondHunter } from "../apps/web/src/lib/pondLife";
import ts from "../apps/web/node_modules/typescript/lib/typescript.js";

const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456";
const techEmail = process.env.DEMO_TECH_EMAIL || "tech@example.com";
const techPassword = process.env.DEMO_TECH_PASSWORD || "MakeReadyTech!23456";

test("move-in risk agrees across full lists, windowed pages and CSV exports", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken } = await (await session).json();
  const headers = { "x-csrf-token": csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const { property } = await post("/operations/properties", { code: `RISK${Date.now()}`, name: "Risk parity test" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const date = (offset: number) => {
    const value = new Date(); value.setUTCDate(value.getUTCDate() + offset); value.setUTCHours(12, 0, 0, 0);
    return value.toISOString();
  };
  const fixtures = [
    { unitNumber: "RISK-INSPECTION", completionStatus: "YES", makeReadyStatus: "FINAL WALK", moveInDate: date(5), makeReadyDate: date(4), included: true },
    { unitNumber: "RISK-UNSET", completionStatus: null, moveInDate: date(5), included: true },
    { unitNumber: "RISK-READY", completionStatus: "YES", makeReadyStatus: "DONE", moveInDate: date(5), makeReadyDate: date(7), included: false },
    { unitNumber: "RISK-VACANCY-READY", vacancyStatus: "VACANT LEASED READY", moveInDate: date(5), included: false },
    { unitNumber: "RISK-LEGACY", vacancyStatus: "VACANT_READY", moveInDate: date(5), included: false },
    { unitNumber: "RISK-CONFLICT", moveInDate: date(30), makeReadyDate: date(32), included: true },
    { unitNumber: "RISK-LATER", moveInDate: date(30), makeReadyDate: date(20), included: false },
  ];
  const expected: string[] = [];
  for (const { included, ...data } of fixtures) {
    const { unit } = await post("/operations/units", { propertyId: property.id, number: data.unitNumber });
    const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: data.unitNumber, vacancyStatus: "VACANT LEASED NOT READY", ...data });
    if (included) expected.push(item.id);
  }
  const query = `propertyId=${property.id}&moveInRiskOnly=true&sortBy=unitNumber&sortDirection=asc`;
  const full = await page.request.get(`/api/make-ready-items?${query}`);
  expect(full.ok(), await full.text()).toBeTruthy();
  expect((await full.json()).map((item: any) => item.id).sort()).toEqual(expected.sort());
  const pages: string[] = [];
  for (let offset = 0; offset < expected.length; offset++) {
    const response = await page.request.get(`/api/make-ready-items?${query}&limit=1&offset=${offset}`);
    expect(response.ok(), await response.text()).toBeTruthy();
    expect(response.headers()["x-total-count"]).toBe(String(expected.length));
    pages.push(...(await response.json()).map((item: any) => item.id));
  }
  expect(pages.sort()).toEqual(expected.sort());
  const exported = await page.request.get(`/api/export/make-ready.csv?${query}`);
  expect(exported.ok(), await exported.text()).toBeTruthy();
  const csv = await exported.text();
  for (const fixture of fixtures) {
    if (fixture.included) expect(csv).toContain(fixture.unitNumber);
    else expect(csv).not.toContain(fixture.unitNumber);
  }
});

test("immediate automations cannot bypass readiness or undo a successful initiating edit", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken } = await (await session).json();
  const headers = { "x-csrf-token": csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const { property } = await post("/operations/properties", { code: `EVENT${Date.now()}`, name: "Immediate guard test" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  for (const mode of ["blocked", "handoff"]) {
    const { unit } = await post("/operations/units", { propertyId: property.id, number: `EVENT-${mode}` });
    const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" });
    const root = `/api/make-ready-items/${item.id}`;
    if (mode === "blocked") expect((await page.request.put(`${root}/materials`, { headers, data: { version: 0, rows: [{ id: "00000000-0000-4000-8000-000000000008", name: "Replacement latch", quantity: 1, unit: "each", status: "NEEDED", notes: "" }] } })).ok()).toBeTruthy();
    const { rule } = await post("/automations", {
      name: `Immediate ${mode}`, propertyId: property.id, enabled: true, triggerType: "ITEM_UPDATED",
      conditions: { all: [{ field: "unitNumber", operator: "equals", value: unit.number }] },
      actions: [{ type: "setField", field: mode === "blocked" ? "makeReadyStatus" : "completionStatus", value: mode === "blocked" ? "DONE" : "YES" }],
    });
    const edited = await page.request.patch(root, { headers, data: { notes: "User note must remain saved" } });
    expect(edited.status(), await edited.text()).toBe(200);
    const current = await (await page.request.get(root)).json();
    expect(current.notes).toBe("User note must remain saved");
    const { runs } = await (await page.request.get(`/api/automations/runs?ruleId=${rule.id}&itemId=${item.id}`)).json();
    expect(runs).toHaveLength(1);
    if (mode === "blocked") {
      expect(current.makeReadyStatus).not.toBe("DONE");
      expect(current.completionStatus).toBe("NO");
      expect(runs[0].success).toBe(false);
      expect(runs[0].message).toContain("Pending parts");
    } else {
      expect(current.completionStatus).toBe("YES");
      expect(current.makeReadyStatus).toBe("FINAL WALK");
      expect(runs[0].success).toBe(true);
      expect((await page.request.post(`${root}/mark-ready`, { headers })).status()).toBe(409);
      const { rule: bypass } = await post("/automations", {
        name: "Do not skip the inspector", propertyId: property.id, enabled: true, triggerType: "ITEM_UPDATED",
        conditions: { all: [{ field: "unitNumber", operator: "equals", value: unit.number }] },
        actions: [{ type: "setField", field: "makeReadyStatus", value: "DONE" }],
      });
      const editDuringInspection = await page.request.patch(root, { headers, data: { notes: "Still waiting for the inspector" } });
      expect(editDuringInspection.status(), await editDuringInspection.text()).toBe(200);
      expect(await editDuringInspection.json()).toMatchObject({ makeReadyStatus: "FINAL WALK", notes: "Still waiting for the inspector" });
      const history = await (await page.request.get(`/api/automations/runs?ruleId=${bypass.id}&itemId=${item.id}`)).json();
      expect(history.runs[0]).toMatchObject({ success: false });
      expect(history.runs[0].message).toContain("Final walk / Mark ready");
    }
  }
});

test("mark ready rejects incomplete work, self-review and archived turns", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken, user } = await (await session).json();
  const headers = { "x-csrf-token": csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const { property } = await post("/operations/properties", { code: `GATE${Date.now()}`, name: "Readiness test" });
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "GATE-1" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, assignedTech: user.fullName, vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" });
  const root = `/api/make-ready-items/${item.id}`;
  const material = { id: "00000000-0000-4000-8000-000000000005", name: "Required replacement filter", quantity: 1, unit: "each", status: "NEEDED", notes: "" };
  expect((await page.request.put(`${root}/materials`, { headers, data: { version: 0, rows: [material] } })).ok()).toBeTruthy();
  const { rule: blockedRule } = await post("/automations", {
    name: "Do not bypass pending parts", propertyId: property.id, enabled: true, triggerType: "SCHEDULED_CHECK",
    conditions: { all: [{ field: "unitNumber", operator: "equals", value: unit.number }] },
    actions: [{ type: "setField", field: "makeReadyStatus", value: "DONE" }],
  });
  const { execution: blockedRun } = await post(`/automations/${blockedRule.id}/run`, {});
  expect(blockedRun.actionCount).toBe(0);
  expect(blockedRun.results.flatMap((result: any) => result.errors).join(";")).toContain("Pending parts");
  expect((await (await page.request.get(root)).json()).makeReadyStatus).not.toBe("DONE");
  const { template } = await post("/checklist-templates", { propertyId: property.id, name: "Required repair and optional work", items: [{ title: "Verify repair", required: true }, { title: "Optional work", required: false }] });
  const { instance } = await post(`/make-ready-items/${item.id}/checklists`, { templateId: template.id });
  const readySection = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "READY");
  for (const data of [{ makeReadyStatus: "DONE" }, { vacancyStatus: "VACANT NOT LEASED READY" }, { boardGroup: readySection.key }]) {
    expect((await page.request.patch(root, { headers, data })).status()).toBe(409);
  }
  const { unit: secondUnit } = await post("/operations/units", { propertyId: property.id, number: "GATE-2" });
  const second = await post("/make-ready-items", { propertyId: property.id, unitId: secondUnit.id, boardGroup: section.key, itemName: secondUnit.number, unitNumber: secondUnit.number, vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" });
  for (const change of [{ action: "SET_FIELD", field: "makeReadyStatus", value: "DONE" }, { action: "MOVE_GROUP", boardGroup: readySection.key }]) {
    const response = await page.request.post("/api/make-ready-items/batch", { headers, data: { ids: [second.id, item.id], ...change } });
    expect(response.status(), await response.text()).toBe(409);
    const unchanged = await (await page.request.get(`/api/make-ready-items/${second.id}`)).json();
    expect(unchanged.boardGroup).toBe(section.key);
    expect(unchanged.makeReadyStatus).not.toBe("DONE");
  }
  const attempt = () => page.request.post(`${root}/mark-ready`, { headers });
  expect((await attempt()).status()).toBe(409);
  await page.reload();
  await page.getByRole("button", { name: "Open details for GATE-1", exact: true }).click();
  const blockers = page.getByTestId("turn-readiness-blockers");
  await expect(blockers).toContainText("Required checklist: Verify repair");
  await expect(blockers).toContainText("Pending parts");
  await expect(blockers).toContainText("cannot approve their own");
  expect((await page.request.patch(`${root}`, { headers, data: { assignedTech: null } })).ok()).toBeTruthy();
  expect((await attempt()).status()).toBe(409);
  const taskUrl = `/api/checklist-items/${instance.items.find((task: any) => task.required).id}`;
  const completionResponse = await page.request.patch(taskUrl, { headers, data: { completed: true } });
  expect(completionResponse.ok()).toBeTruthy();
  const { checklistItem: originalCompletion } = await completionResponse.json();
  const noteResponse = await page.request.patch(taskUrl, { headers, data: { notes: "Repair confirmed", completed: true } });
  expect(noteResponse.ok()).toBeTruthy();
  const { checklistItem: noteEdit } = await noteResponse.json();
  expect(noteEdit.completedAt).toBe(originalCompletion.completedAt);
  expect(noteEdit.completedById).toBe(originalCompletion.completedById);
  expect((await attempt()).status()).toBe(409);
  expect((await page.request.put(`${root}/materials`, { headers, data: { version: 1, rows: [{ ...material, status: "ON_HAND" }] } })).ok()).toBeTruthy();
  await blockers.getByRole("button", { name: "Recheck completion blockers" }).click();
  await expect(blockers).toHaveCount(0);
  const ready = await attempt(); expect(ready.ok(), await ready.text()).toBeTruthy();
  const completed = await (await page.request.get(root)).json();
  expect(completed.makeReadyStatus).toBe("DONE");
  expect((await page.request.post(`${root}/archive`, { headers })).ok()).toBeTruthy();
  expect((await attempt()).status()).toBe(409);
  expect((await (await page.request.get(root)).json()).isArchived).toBe(true);
  const { rule: completionRule } = await post("/automations", {
    name: "Repair completion hands off to inspection", propertyId: property.id, enabled: true, triggerType: "SCHEDULED_CHECK",
    conditions: { all: [{ field: "unitNumber", operator: "equals", value: secondUnit.number }] },
    actions: [{ type: "setField", field: "completionStatus", value: "YES" }],
  });
  const { execution: completionRun } = await post(`/automations/${completionRule.id}/run`, {});
  expect(completionRun.results.flatMap((result: any) => result.errors)).toEqual([]);
  const handedOff = await (await page.request.get(`/api/make-ready-items/${second.id}`)).json();
  expect(handedOff.completionStatus).toBe("YES");
  expect(handedOff.makeReadyStatus).toBe("FINAL WALK");
  expect((await page.request.post(`/api/make-ready-items/${second.id}/mark-ready`, { headers })).status()).toBe(409);
});

test("changing the inspection status cannot waive an existing report requirement", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const headers = { "x-csrf-token": (await (await session).json()).csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const { property } = await post("/operations/properties", { code: `HIST${Date.now()}`, name: "Inspection history test" });
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "HISTORY-1" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" });
  const root = `/api/make-ready-items/${item.id}`;
  expect((await page.request.patch(root, { headers, data: { completionStatus: "YES" } })).ok()).toBeTruthy();
  const report = await (await page.request.get(`/api/final-walk-reports/${property.id}?itemId=${item.id}`)).json();
  const reportUrl = `/api/final-walk-reports/${property.id}/items/${item.id}`;
  const saved = await page.request.put(reportUrl, { headers, data: { version: report.draft.version, value: report.draft.value } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect((await page.request.patch(root, { headers, data: { makeReadyStatus: "LITE" } })).ok()).toBeTruthy();
  const blocked = await page.request.post(`${root}/mark-ready`, { headers });
  expect(blocked.status(), await blocked.text()).toBe(409);
  expect((await blocked.json()).message).toContain("final-walk checks are not recorded");
  expect((await (await page.request.get(root)).json()).makeReadyStatus).toBe("LITE");
  const { rule } = await post("/automations", {
    name: "Do not bypass inspection history", propertyId: property.id, enabled: true, triggerType: "SCHEDULED_CHECK",
    conditions: { all: [{ field: "unitNumber", operator: "equals", value: unit.number }] },
    actions: [{ type: "setField", field: "makeReadyStatus", value: "DONE" }],
  });
  const { execution: run } = await post(`/automations/${rule.id}/run`, {});
  expect(run.actionCount).toBe(0);
  expect(run.results.flatMap((result: any) => result.errors).join(";")).toContain("Final walk / Mark ready");
  expect((await (await page.request.get(root)).json()).makeReadyStatus).toBe("LITE");
  const value = report.draft.value;
  value.inspectionDate = new Date().toISOString().slice(0, 10);
  for (const check of report.checks) value.results[check.id] = { status: "CHECKED", note: "Inspected" };
  const complete = await page.request.put(reportUrl, { headers, data: { version: (await saved.json()).version, value } });
  expect(complete.ok(), await complete.text()).toBeTruthy();
  const ready = await page.request.post(`${root}/mark-ready`, { headers });
  expect(ready.ok(), await ready.text()).toBeTruthy();
  expect((await ready.json()).makeReadyStatus).toBe("DONE");
});

test("turn materials survive saves, conflicts and native restore without leaking into resident reports", async ({ page }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true }));
  test.setTimeout(90000);
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const headers = { "x-csrf-token": (await (await session).json()).csrfToken };
  const items = await (await page.request.get("/api/make-ready-items")).json();
  const item = items.find((entry: any) => entry.unitNumber === "284") ?? items[0];
  const root = `/api/make-ready-items/${item.id}/materials`;
  await page.getByRole("button", { name: `Open details for ${item.unitNumber}`, exact: true }).click();
  const panel = page.getByTestId("turn-materials");
  await panel.getByRole("button", { name: "Add part / material" }).click();
  const modal = page.getByTestId("turn-material-editor");
  await expect(modal).toBeVisible();
  await modal.getByLabel("Part / material", { exact: true }).fill("Internal-only filter purchase");
  await modal.getByLabel("Quantity", { exact: true }).fill("2");
  await modal.getByLabel("Notes / supplier / order reference").fill("PRIVATE-SUPPLIER-ORDER");
  await page.route(`**${root}`, async route => {
    if (route.request().method() === "PUT") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary save failure" }) });
    return route.continue();
  });
  await modal.getByRole("button", { name: "Save material", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("Temporary save failure");
  await expect(modal.getByLabel("Part / material", { exact: true })).toHaveValue("Internal-only filter purchase");
  await modal.getByRole("button", { name: "Keep draft on this device", exact: true }).click();
  await expect(panel.getByTestId("material-draft-recovery")).toContainText("not saved to the team list");
  await page.reload();
  await page.getByRole("button", { name: `Open details for ${item.unitNumber}`, exact: true }).click();
  await panel.getByRole("button", { name: "Resume material draft", exact: true }).click();
  await expect(modal.getByLabel("Part / material", { exact: true })).toHaveValue("Internal-only filter purchase");
  await expect(modal.getByLabel("Quantity", { exact: true })).toHaveValue("2");
  await expect(modal.getByLabel("Notes / supplier / order reference")).toHaveValue("PRIVATE-SUPPLIER-ORDER");
  await page.unroute(`**${root}`);
  await modal.getByRole("button", { name: "Save material", exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(panel.getByTestId("material-draft-recovery")).toHaveCount(0);
  await expect(panel).toContainText("2 each / Needed");
  const saved = await (await page.request.get(root)).json();
  expect(saved.rows).toHaveLength(1);
  await panel.getByRole("button", { name: "Edit Internal-only filter purchase" }).click();
  await modal.getByRole("combobox", { name: "Status", exact: true }).selectOption("ORDERED");
  expect((await page.request.put(root, { headers, data: { rows: saved.rows.map((row: any) => ({ ...row, status: "ON_HAND" })), version: saved.version } })).ok()).toBeTruthy();
  await modal.getByRole("button", { name: "Save material", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("changed in another session");
  await expect(modal.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("ORDERED");
  page.once("dialog", dialog => dialog.accept());
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toContainText("On hand");
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole("button", { name: "Edit Internal-only filter purchase" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await modal.getByRole("combobox", { name: "Status", exact: true }).selectOption("USED");
  expect(await modal.locator("label").evaluateAll(labels => labels.every((label, index) => !index || label.getBoundingClientRect().top >= labels[index - 1].getBoundingClientRect().bottom))).toBeTruthy();
  await modal.screenshot({ path: testInfo.outputPath("turn-materials-mobile.png") });
  await modal.getByRole("button", { name: "Save material", exact: true }).click();
  await expect(panel).toContainText("2 each / Used");
  const report = await (await page.request.get(`/api/final-walk-reports/${item.propertyId}?itemId=${item.id}`)).json();
  const preview = await page.request.post(`/api/final-walk-reports/${item.propertyId}/preview`, { headers, data: { itemId: item.id, settings: report.settings.value, draft: report.draft.value, format: "html" } });
  expect(preview.ok()).toBeTruthy();
  expect(await preview.text()).not.toContain("PRIVATE-SUPPLIER-ORDER");
  expect(await preview.text()).not.toContain("Internal-only filter purchase");
  const backup = await (await page.request.get("/api/admin/export")).json();
  const portableItem = backup.data.makeReadyItems.find((entry: any) => entry.propertyCode === item.property.code && entry.unitNumber === item.unitNumber);
  expect(portableItem.materials[0].status).toBe("USED");
  const code = `PARTS${Date.now()}`;
  const portable = { ...backup, data: { properties: [{ code, name: "Parts restore", isActive: true }], units: [], makeReadyItems: [{ ...portableItem, propertyCode: code }], customFields: [], customFieldOptions: [], customFieldValues: [], savedViews: [], automationRules: [], checklistTemplates: [], notes: [] } };
  const restored = await page.request.post("/api/admin/import", { headers, data: { dryRun: false, backup: portable } });
  expect(restored.ok(), await restored.text()).toBeTruthy();
  const after = await (await page.request.get("/api/admin/export")).json();
  expect(after.data.makeReadyItems.find((entry: any) => entry.propertyCode === code).materials).toEqual(portableItem.materials);
  const restoredMeta = await (await page.request.get("/api/meta")).json();
  const restoredProperty = restoredMeta.properties.find((property: any) => property.code === code);
  expect((await page.request.post(`/api/operations/properties/${restoredProperty.id}/archive`, { headers })).ok()).toBeTruthy();
});

test("mailbox import lives in Units with a property-specific copyable conversion prompt", async ({ page, context }) => {
  page.setDefaultTimeout(15000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-operations").click();
  const units = page.getByTestId("unit-management");
  const propertySelect = units.getByTestId("unit-directory-property");
  await expect.poll(() => propertySelect.locator("option").count()).toBeGreaterThan(2);
  const properties = await propertySelect.locator("option").evaluateAll(options => options.map(option => ({ value: (option as HTMLOptionElement).value, label: option.textContent ?? "" })).filter(option => option.value));
  expect(properties.length).toBeGreaterThan(1);
  await propertySelect.selectOption(properties[0].value);
  const panel = units.getByTestId("mailbox-directory-panel");
  await panel.locator("summary").first().click();
  await panel.getByTestId("mailbox-import-ai-help").locator("summary").click();
  const prompt = panel.getByTestId("mailbox-conversion-prompt");
  await expect(prompt).toContainText("unit,mailbox");
  const firstPrompt = await prompt.inputValue();
  expect(firstPrompt).toContain(properties[0].label.replace(" - ", " / "));
  expect(firstPrompt).toContain("Do not assume mailbox numbers match unit numbers");
  await panel.getByRole("button", { name: "Copy conversion prompt", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(firstPrompt);
  await panel.getByTestId("mailbox-import-text").fill("unit,mailbox\n101,001");
  await propertySelect.selectOption(properties[1].value);
  await panel.locator("summary").first().click();
  await expect(panel.getByTestId("mailbox-import-text")).toHaveValue("");
  await panel.getByTestId("mailbox-import-ai-help").locator("summary").click();
  await expect(prompt).toContainText(properties[1].label.replace(" - ", " / "));
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await panel.getByRole("button", { name: "Copy conversion prompt", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("copy it manually");
  expect(await prompt.evaluate(element => { const textarea = element as HTMLTextAreaElement; return textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length; })).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("mailbox directory imports populate turn reports and isolate resident codes", async ({ page }) => {
  test.setTimeout(120000); page.setDefaultTimeout(15000);
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken } = await (await session).json();
  const headers = { "x-csrf-token": csrfToken };
  const items = await (await page.request.get("/api/make-ready-items")).json();
  const item = items.find((item: { unitId: string | null }) => item.unitId);
  expect(item).toBeTruthy();
  const root = `/api/mailboxes/${item.propertyId}`;
  const directory = await (await page.request.get(root)).json();
  const unit = directory.units.find((unit: { id: string }) => unit.id === item.unitId);
  expect(unit).toBeTruthy();
  await page.getByTestId("tab-operations").click();
  await page.getByTestId(`property-row-${item.property.code.toLowerCase()}`).click();
  const panel = page.getByTestId("mailbox-directory-panel");
  await panel.locator("summary").first().click();
  await expect(panel).toContainText(`Target property: ${item.property.code}`);
  await panel.getByTestId("mailbox-import-text").fill(`unit,mailbox\n${unit.number},007\nNO-SUCH-UNIT,999`);
  await panel.getByRole("button", { name: "Preview mailbox import", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("1 mailbox assignments to update");
  expect((await (await page.request.get(root)).json()).units.find((u: { id: string }) => u.id === unit.id).mailboxNumber).toBeNull();
  await expect(panel.getByRole("button", { name: `Apply mailbox import to ${item.property.code}`, exact: true })).toBeDisabled();
  await panel.getByRole("checkbox", { name: "Skip flagged rows and import valid rows only" }).check();
  await panel.getByRole("button", { name: `Apply mailbox import to ${item.property.code}`, exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Saved: 1");
  await expect(panel).toContainText("1 rows were skipped");
  const afterPartial = await (await page.request.get(root)).json();
  expect(afterPartial.units.length).toBe(directory.units.length);
  expect(afterPartial.units.filter((u: { id: string }) => u.id !== unit.id)).toEqual(directory.units.filter((u: { id: string }) => u.id !== unit.id));
  const input = { mode: "UNIT_NUMBER", overwrite: true };
  const preview = await (await page.request.post(`${root}/import`, { headers, data: input })).json();
  expect((await page.request.patch(`${root}/${unit.id}`, { headers, data: { expected: "007", mailboxNumber: "008" } })).status()).toBe(200);
  expect((await page.request.post(`${root}/import`, { headers, data: { ...input, token: preview.token } })).status()).toBe(409);
  const other = items.find((other: { propertyId: string }) => other.propertyId !== item.propertyId);
  expect((await page.request.patch(`/api/mailboxes/${other.propertyId}/${unit.id}`, { headers, data: { expected: "008", mailboxNumber: "BAD" } })).status()).toBe(409);
  const badInput = { mode: "DIRECTORY", text: "unit,mailbox\nNO-SUCH-UNIT,123" };
  const bad = await (await page.request.post(`${root}/import`, { headers, data: badInput })).json();
  expect(bad.errors).toHaveLength(1);
  expect((await page.request.post(`${root}/import`, { headers, data: { ...badInput, token: bad.token } })).status()).toBe(400);
  expect((await page.request.post(`${root}/import`, { headers, data: { ...badInput, token: bad.token, skipInvalid: true } })).status()).toBe(400);
  await page.getByTestId("tab-table").click();
  await page.getByRole("button", { name: `Open details for ${item.unitNumber}`, exact: true }).click();
  const turnPanel = page.getByTestId("turn-report-panel");
  await expect(turnPanel.getByTestId("turn-mailbox-number")).toHaveValue("008");
  await turnPanel.getByRole("button", { name: "Edit / Preview this Final-Walk Report" }).click();
  const editor = page.getByTestId("final-report-editor");
  await expect(editor.getByTestId("final-report-unit")).toHaveValue(item.id);
  await expect(editor.getByTestId("report-mailbox")).toHaveValue("008");
  await editor.getByTestId("report-door-code").fill("RESIDENT-9876");
  await editor.getByTestId("final-report-preview").click();
  await expect(editor.frameLocator("iframe").locator("body")).toContainText("008");
  await expect(editor.frameLocator("iframe").locator("body")).not.toContainText("RESIDENT-9876");
  await editor.getByRole("checkbox", { name: /I confirm these are resident-specific/ }).check();
  await editor.getByTestId("final-report-save-draft").click();
  await expect(editor.getByRole("status")).toContainText("Inspection draft saved");
  const download = page.waitForEvent("download");
  await editor.getByTestId("final-report-pdf").click();
  const file = await download; expect(await file.failure()).toBeNull();
  const pdf = readFileSync((await file.path())!).toString("latin1");
  expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  await editor.getByTestId("final-report-preview").click();
  await expect(editor.frameLocator("iframe").locator("body")).toContainText("RESIDENT-9876");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.keyboard.press("Escape");
  const fresh = await (await page.request.get(`/api/final-walk-reports/${item.propertyId}?itemId=${item.id}`)).json();
  expect(fresh.draft.value.residentDoorCode).toBe("RESIDENT-9876");
  const another = items.find((other: { propertyId: string; id: string }) => other.propertyId === item.propertyId && other.id !== item.id);
  const blank = await (await page.request.get(`/api/final-walk-reports/${item.propertyId}?itemId=${another.id}`)).json();
  expect(blank.draft.value.residentDoorCode).toBe("");
  const ordinary = await (await page.request.get("/api/make-ready-items")).json();
  expect(JSON.stringify(ordinary)).not.toContain("RESIDENT-9876");
  const backup = await (await page.request.get("/api/admin/export")).json();
  const savedUnit = backup.data.units.find((u: { propertyCode: string; number: string }) => u.propertyCode === item.property.code && u.number === unit.number);
  expect(savedUnit.mailboxNumber).toBe("008");
  const restoreCode = `MAIL${Date.now()}`;
  const portable = { ...backup, data: { properties: [{ code: restoreCode, name: "Mailbox restore", isActive: true }], units: [{ ...savedUnit, propertyCode: restoreCode, floorPlanCode: null, floorPlanName: null }], makeReadyItems: [], customFields: [], customFieldOptions: [], customFieldValues: [], savedViews: [], automationRules: [], checklistTemplates: [], notes: [] } };
  const restored = await page.request.post("/api/admin/import", { headers, data: { dryRun: false, backup: portable } });
  expect(restored.ok(), await restored.text()).toBeTruthy();
  const restoredBackup = await (await page.request.get("/api/admin/export")).json();
  expect(restoredBackup.data.units.find((u: { propertyCode: string }) => u.propertyCode === restoreCode).mailboxNumber).toBe("008");
});

test("admin final-walk report editor saves drafts, uses real branding and produces one-page PDFs", async ({ page }) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken } = await (await session).json();
  const headers = { "x-csrf-token": csrfToken };
  const items = await (await page.request.get("/api/make-ready-items")).json();
  const item = items[0];
  const other = items.find((entry: { propertyId: string }) => entry.propertyId !== item.propertyId);
  const property = item.property;
  const root = `/api/final-walk-reports/${property.id}`;
  const companyResponse = await page.request.post("/api/management-companies", { headers, data: { name: `Report <Company & Team> ${Date.now()}` } });
  expect(companyResponse.ok(), await companyResponse.text()).toBeTruthy();
  const { company } = await companyResponse.json();
  const logo = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 40; const context = canvas.getContext("2d")!; context.fillStyle = "#174d49"; context.fillRect(0,0,80,40); context.fillStyle = "white"; context.fillText("LOGO", 10,25); return canvas.toDataURL("image/png"); });
  expect((await page.request.patch(`/api/management-companies/${company.id}`, { headers, data: { logo } })).ok()).toBeTruthy();
  expect((await page.request.put(`/api/property-branding/${property.id}`, { headers, data: { managementCompanyId: company.id, logo } })).ok()).toBeTruthy();
  await page.getByTestId("tab-operations").click();
  await page.getByTestId(`property-row-${property.code.toLowerCase()}`).click();
  await page.getByTestId("open-final-report-editor").click();
  const modal = page.getByTestId("final-report-editor");
  await expect(modal).toBeVisible();
  await modal.getByTestId("final-report-title").fill("Your Home / <Report & Preview>");
  await modal.getByRole("button", { name: "Save report settings", exact: true }).click();
  await expect(modal.getByRole("status")).toContainText("Report settings saved");
  await modal.getByTestId("final-report-unit").selectOption(item.id);
  await modal.getByTestId("final-report-date").fill("2026-09-07");
  await modal.locator("summary").filter({ hasText: "General preparation & HVAC" }).click();
  await modal.getByTestId("final-report-result-general-1").selectOption("CHECKED");
  await modal.getByTestId("final-report-save-draft").click();
  await expect(modal.getByRole("status")).toContainText("Inspection draft saved");
  await modal.getByTestId("final-report-preview").click();
  const preview = modal.frameLocator('iframe[title="Final-walk draft preview"]');
  await expect(preview.locator("h1")).toHaveText("Your Home / <Report & Preview>");
  await expect(preview.locator(".brand")).toContainText(property.name);
  await expect(preview.locator(".brand")).toContainText(company.name);
  await expect(preview.locator("img")).toHaveCount(2);
  expect(await preview.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBeTruthy();
  await expect(preview.locator(".CHECKED")).toHaveCount(1);
  await expect(preview.locator(".NOT_CHECKED")).toHaveCount(44);
  await expect(preview.locator(".draft")).toContainText("NOT FOR RESIDENT ISSUE");
  await modal.screenshot({ path: "/tmp/mros-final-report-desktop.png" });
  const download = page.waitForEvent("download");
  await modal.getByTestId("final-report-pdf").click();
  const pdf = await download;
  await pdf.saveAs("/tmp/mros-final-report-live-data.pdf");
  const bytes = readFileSync("/tmp/mros-final-report-live-data.pdf");
  expect(bytes.subarray(0,4).toString()).toBe("%PDF");
  expect((bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(modal.getByTestId("final-report-title")).toBeVisible();
  await modal.screenshot({ path: "/tmp/mros-final-report-mobile.png" });
  await modal.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId("open-final-report-editor").click();
  await expect(modal.getByTestId("final-report-title")).toHaveValue("Your Home / <Report & Preview>");
  await modal.getByTestId("final-report-unit").selectOption(item.id);
  await modal.locator("summary").filter({ hasText: "General preparation & HVAC" }).click();
  await expect(modal.getByTestId("final-report-result-general-1")).toHaveValue("CHECKED");
  const data = await (await page.request.get(`${root}?itemId=${item.id}`)).json();
  const draftInput = { version: data.draft.version, value: data.draft.value };
  const races = await Promise.all([page.request.put(`${root}/items/${item.id}`, { headers, data: draftInput }), page.request.put(`${root}/items/${item.id}`, { headers, data: draftInput })]);
  expect(races.map(response => response.status()).sort()).toEqual([200,409]);
  const settingsRaces = await Promise.all([page.request.put(`${root}/settings`, { headers, data: data.settings }), page.request.put(`${root}/settings`, { headers, data: data.settings })]);
  expect(settingsRaces.map(response => response.status()).sort()).toEqual([200,409]);
  expect((await page.request.post(`${root}/preview`, { headers, data: { itemId: other.id, settings: data.settings.value, draft: data.draft.value, format: "html" } })).status()).toBe(404);
  const hugeDraft = { ...data.draft.value, results: Object.fromEntries(data.checks.map((check: { id: string }) => [check.id, { status: "ATTENTION", note: "Detailed unresolved inspection concern requiring additional repairs and review. ".repeat(2).slice(0,100) }])) };
  const oversized = await page.request.post(`${root}/preview`, { headers, data: { itemId: item.id, settings: data.settings.value, draft: hugeDraft, format: "pdf" } });
  expect(oversized.status(), await oversized.text()).toBe(422);
  const unchanged = await (await page.request.get(`/api/make-ready-items/${item.id}`)).json();
  expect(unchanged.completionStatus).toBe(item.completionStatus);
  expect(unchanged.makeReadyStatus).toBe(item.makeReadyStatus);
  expect(unchanged.finalWalkReportDraft).toBeUndefined();
  const backup = await (await page.request.get("/api/admin/export")).json();
  const savedItem = backup.data.makeReadyItems.find((turn: { propertyCode: string; unitNumber: string }) => turn.propertyCode === property.code && turn.unitNumber === item.unitNumber);
  expect(savedItem.finalWalkReportDraft.value.results["general-1"].status).toBe("CHECKED");
  const savedBranding = backup.data.propertyBranding.find((entry: { propertyCode: string }) => entry.propertyCode === property.code);
  expect(savedBranding.finalWalkReportSettings.value.title).toBe("Your Home / <Report & Preview>");
  const restoreCode = `REPORT${Date.now()}`;
  const portable = { ...backup, data: { properties: [{ code: restoreCode, name: "Restored report", isActive: true }], units: [], makeReadyItems: [{ ...savedItem, propertyCode: restoreCode }], managementCompanies: [{ name: company.name, logo }], propertyBranding: [{ ...savedBranding, propertyCode: restoreCode }], customFields: [], customFieldOptions: [], customFieldValues: [], savedViews: [], automationRules: [], checklistTemplates: [], notes: [] } };
  const restored = await page.request.post("/api/admin/import", { headers, data: { dryRun: false, backup: portable } });
  expect(restored.ok(), await restored.text()).toBeTruthy();
  const exported = await (await page.request.get("/api/admin/export")).json();
  expect(exported.data.makeReadyItems.find((turn: { propertyCode: string }) => turn.propertyCode === restoreCode).finalWalkReportDraft.value.results["general-1"].status).toBe("CHECKED");
});

test("pond field guide detailed art covers every wildlife and secret", async ({ page }) => {
  page.setDefaultTimeout(15000);
  for (const kind of [...pondWildlife.map(entry => entry.id), ...pondSecrets.map(entry => entry.icon)]) {
    expect(pondPixelArt[kind].palette).toHaveLength(6);
    expect(pondPixelArt[kind].layers.length).toBeGreaterThanOrEqual(4);
  }
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  const guide = page.getByTestId("pond-field-guide");
  await guide.locator("summary").click();
  await expect(guide.locator('[data-discovery="secret-pond-06"] .pond-pixel')).toHaveClass(/pond-undiscovered/);
  const ids = [...pondWildlife.map(entry => `wild-${entry.id}`), ...pondSecrets.map(entry => `secret-${entry.theme}`)];
  // Reveal art only in this isolated browser, without changing production unlock rules.
  await page.evaluate(ids => {
    const key = Object.keys(localStorage).find(key => key.startsWith("makereadyos.frogPond.collection."))!;
    const collection = JSON.parse(localStorage.getItem(key)!);
    collection.discovered = Object.fromEntries(ids.map(id => [id, new Date().toISOString()]));
    localStorage.setItem(key, JSON.stringify(collection));
  }, ids);
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await guide.locator("summary").click();
  for (const id of ids) {
    const art = guide.locator(`[data-discovery="${id}"] svg`);
    await expect(art).not.toHaveClass(/pond-undiscovered/);
    await expect(art).toHaveAttribute("shape-rendering", "crispEdges");
    expect(await art.locator("path").count()).toBeGreaterThanOrEqual(4);
    expect(await art.locator("path").evaluateAll(paths => new Set(paths.map(path => path.getAttribute("fill"))).size)).toBeGreaterThanOrEqual(4);
  }
  await expect(guide.locator('[data-discovery="secret-pond-06"] svg')).toHaveAttribute("data-pixel-art", "treasure");
  await expect(guide.locator('[data-discovery="secret-pond-15"] svg')).toHaveAttribute("data-pixel-art", "sunflower");
  await page.setViewportSize({ width: 1440, height: 2400 });
  await guide.locator(".pond-guide-entries").screenshot({ path: "/tmp/mros-field-guide-art-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await guide.locator(".pond-guide-entries").screenshot({ path: "/tmp/mros-field-guide-art-mobile.png" });
});

test("pond ecosystem discovery rules and crystal pitches", () => {
  expect(["turtle", "snail", "home", "mug", "treasure", "sunflower", "new-prop"].map(pondDiscoveryHabitat)).toEqual(Array(7).fill("ground"));
  expect(["strider", "duck", "axolotl", "flower"].map(pondDiscoveryHabitat)).toEqual(Array(4).fill("water"));
  expect(["butterfly", "fireflies", "moon", "ghost", "disco"].map(pondDiscoveryHabitat)).toEqual(Array(5).fill("sky"));
  expect(new Set(pondSecrets.map(secret => secret.theme)).size).toBe(15);
  expect(pondWildlife).toHaveLength(7);
  expect(wildlifeVisible("butterfly", 100, "night")).toBe(false);
  expect(wildlifeVisible("butterfly", 100, "day")).toBe(true);
  expect(wildlifeVisible("fireflies", 100, "night")).toBe(true);
  expect(wildlifeVisible("axolotl", 700, "day")).toBe(true);
  expect(wildlifeVisible("axolotl", 20, "day")).toBe(false);
  expect(localPondDate(new Date(2026, 8, 7))).toBe("2026-09-07");
  expect(gardenWaterings({ "garden-2026-09-01": "x", "garden-2026-09-07": "x", "wild-snail": "x" })).toBe(2);
  expect([0,3,6,9].map(pondSeason)).toEqual(["winter", "spring", "summer", "autumn"]);
  expect(["crystal-low", "crystal-middle", "crystal-high"].map(cue => pondSoundNotes(cue as "crystal-low")[0].frequency)).toEqual([523,659,784]);
});

test("pond habitat keeps ground and water discoveries below the sky on desktop and mobile", async ({ page }) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  await page.clock.install({ time: new Date(2026, 8, 7, 12) });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("frog-settings-toggle").click();
  const inspectHabitat = async (selector: string, sky = false) => {
    const target = page.locator(selector);
    await expect(target).toBeVisible();
    const measurements = await target.evaluate((element, sky) => {
      const scene = element.closest('[data-testid="frog-pond-scene"]')!.getBoundingClientRect();
      const animations = element.getAnimations({ subtree: true });
      const samples = [0, .45, .9, .99].map(fraction => {
        animations.forEach(animation => { animation.pause(); animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction; });
        const rect = (element.querySelector("svg") ?? element).getBoundingClientRect();
        return sky ? rect.top < scene.top + scene.height / 3 : rect.top >= scene.top + scene.height / 3 && rect.bottom <= scene.bottom;
      });
      animations.forEach(animation => animation.play());
      return samples;
    }, sky);
    expect(measurements, selector).toEqual([true, true, true, true]);
  };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await inspectHabitat('[data-testid="pond-wild-strider"]');
    for (const secret of pondSecrets) {
      await page.getByTestId("frog-theme").selectOption(secret.theme);
      await inspectHabitat('[data-testid="pond-theme-secret"]', pondDiscoveryHabitat(secret.icon) === "sky");
      if (secret.theme === "pond-07") await inspectHabitat('.pond-crystal-notes');
      if (secret.theme === "pond-15") await inspectHabitat('.pond-garden-stage');
    }
  }
  await page.clock.runFor(72000);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await inspectHabitat('[data-testid="pond-wild-turtle"]');
    await inspectHabitat('[data-testid="pond-wild-snail"]');
  }
  await page.clock.runFor(60000);
  await inspectHabitat('[data-testid="pond-wild-duck"]');
  await page.clock.runFor(50000);
  await inspectHabitat('[data-testid="pond-wild-axolotl"]');
});

test("pond ecosystem secrets unlock cosmetics, persist and fit mobile", async ({ page }) => {
  await page.clock.install();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("frog-settings-toggle").click();
  const theme = page.getByTestId("frog-theme");
  await theme.selectOption("pond-12");
  await page.getByTestId("pond-theme-secret").click();
  await expect(page.getByRole("status").filter({ hasText: "Little barista discovered" })).toBeVisible();
  await page.getByTestId("pond-collection").locator("summary").click();
  await page.getByTestId("pond-reward-barista").click();
  await expect(page.locator(".pond-barista").first()).toBeVisible();
  await theme.selectOption("pond-07");
  await page.getByRole("button", { name: "Play low crystal", exact: true }).click();
  await page.getByRole("button", { name: "Play high crystal", exact: true }).click();
  await page.getByRole("button", { name: "Play middle crystal", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Crystal melody discovered" })).toBeVisible();
  await theme.selectOption("pond-08");
  await page.getByTestId("pond-theme-secret").click();
  await expect(page.locator(".pond-dancing").first()).toBeVisible();
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(page.locator(".pond-dancing .frog-body").first()).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "Resume motion", exact: true }).click();
  await theme.selectOption("pond-13");
  await page.getByTestId("pond-theme-secret").click();
  await page.getByText("Pond decorations", { exact: true }).click();
  await page.getByRole("combobox", { name: "Rare frog colors" }).selectOption("mint");
  await page.getByRole("combobox", { name: "Pond season" }).selectOption("winter");
  await expect(page.locator(".pond-season-winter")).toHaveCount(1);
  await page.getByTestId("frog-pond-scene").screenshot({ path: "/tmp/mros-ecosystem-desktop.png" });
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-field-guide").locator("summary").click();
  await expect(page.locator('[data-discovery="secret-pond-12"]')).toContainText("Little barista");
  await expect(page.locator('[data-discovery="secret-pond-07"]')).toContainText("Crystal melody");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByTestId("frog-pond-scene").screenshot({ path: "/tmp/mros-ecosystem-mobile.png" });
  expect(errors).toEqual([]);
});

test("pond ecosystem wildlife cycle, adult chorus and pause leave work untouched", async ({ page }) => {
  test.setTimeout(90000);
  await page.clock.install({ time: new Date(2026, 8, 7, 12) });
  await login(page, adminEmail, adminPassword);
  const mutations: string[] = [];
  page.on("request", request => { if (/\/api\/items\//.test(request.url()) && ["PATCH", "PUT", "POST", "DELETE"].includes(request.method())) mutations.push(request.url()); });
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-field-guide").locator("summary").click();
  const discovered = (id: string) => page.locator(`[data-discovery="${id}"] .pond-pixel`);
  await expect(discovered("wild-strider")).not.toHaveClass(/pond-undiscovered/);
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  await page.clock.runFor(20000);
  await expect(discovered("wild-butterfly")).toHaveClass(/pond-undiscovered/);
  await expect(page.getByTestId("pond-wild-strider")).toHaveCSS("animation-name", "none");
  await page.getByRole("button", { name: "Resume motion", exact: true }).click();
  await page.locator(".frog-marker:not(.frog-pose-tadpole)").first().click();
  await page.clock.runFor(1320);
  await expect(discovered("antic-chorus")).not.toHaveClass(/pond-undiscovered/);
  await page.mouse.move(0, 0);
  await page.clock.runFor(15000);
  await expect(discovered("wild-butterfly")).not.toHaveClass(/pond-undiscovered/);
  await page.clock.runFor(60000);
  await expect(discovered("wild-snail")).not.toHaveClass(/pond-undiscovered/);
  await expect(discovered("wild-turtle")).not.toHaveClass(/pond-undiscovered/);
  await page.clock.runFor(80000);
  await expect(discovered("wild-duck")).not.toHaveClass(/pond-undiscovered/);
  await expect(discovered("wild-axolotl")).not.toHaveClass(/pond-undiscovered/);
  expect(mutations).toEqual([]);
});

test("pond ecosystem garden counts distinct visits without a streak", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 7, 12) });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("frog-settings-toggle").click();
  await page.getByTestId("frog-theme").selectOption("pond-15");
  await page.getByTestId("pond-theme-secret").click();
  await page.getByTestId("pond-theme-secret").click();
  await expect(page.getByLabel("Garden: 1 of 3 watering days")).toBeVisible();
  await page.clock.setSystemTime(new Date(2026, 8, 10, 12));
  await page.getByTestId("pond-theme-secret").click();
  await expect(page.getByLabel("Garden: 2 of 3 watering days")).toBeVisible();
  await page.clock.setSystemTime(new Date(2026, 8, 16, 12));
  await page.getByTestId("pond-theme-secret").click();
  await expect(page.getByLabel("Garden: 3 of 3 watering days")).toContainText("Sunflower in bloom");
  await page.getByTestId("pond-field-guide").locator("summary").click();
  await expect(page.locator('[data-discovery="secret-pond-15"]')).toContainText("Sunflower gardener");
});

test("pond ribbit and munch have distinct envelopes and audible gain", () => {
  const ribbit = pondSoundNotes("frog");
  const munch = pondSoundNotes("catch");
  expect(ribbit).toHaveLength(2);
  expect(ribbit.every(note => note.wave === "square" && note.warble)).toBeTruthy();
  expect(munch.every(note => note.duration < .1 && note.wave !== "square" && !note.warble)).toBeTruthy();
  expect(Math.max(...ribbit.map(note => note.delay + note.duration))).toBeGreaterThan(.4);
  expect(Math.max(...munch.map(note => note.delay + note.duration))).toBeLessThan(.2);
  expect(pondSoundNotes("bubble")[0].gain).toBeGreaterThan(.055);
  for (const cue of ["frog", "catch", "bubble", "splash", "visitor", "ready", "rain"] as const) {
    const notes = pondSoundNotes(cue);
    expect(notes.reduce((sum, note) => sum + note.gain, 0)).toBeLessThan(1);
    expect(notes.every(note => note.frequency > 0 && note.end > 0 && note.duration > 0)).toBeTruthy();
  }
});

test("pond audio plays automatically after opt-in and stays quiet when paused or hidden", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const audio = { starts: 0, contexts: 0, volumes: [] as number[] };
    Object.assign(window, { pondAudioTest: audio });
    class FakeAudioContext {
      state = "suspended";
      destination = {};
      get currentTime() { return Date.now() / 1000; }
      constructor() { audio.contexts++; }
      async resume() { this.state = "running"; }
      async suspend() { this.state = "suspended"; }
      async close() { this.state = "closed"; }
      createGain() { return { gain: { value: 0, setValueAtTime: (v: number) => audio.volumes.push(v), linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      createOscillator() { return { frequency: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { audio.starts++; }, stop() {} }; }
    }
    Object.assign(window, { AudioContext: FakeAudioContext });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  const stats = () => page.evaluate(() => (window as unknown as { pondAudioTest: { starts: number; contexts: number; volumes: number[] } }).pondAudioTest);
  await page.clock.runFor(9000);
  expect((await stats()).contexts).toBe(0);
  await page.getByRole("button", { name: "Sound: off", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Pond volume" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Pond volume" })).toHaveValue("65");
  await page.clock.runFor(26000);
  expect((await stats()).starts).toBeGreaterThan(0);
  await page.getByRole("slider", { name: "Pond volume" }).press("Home");
  for (let i = 0; i < 4; i++) await page.getByRole("slider", { name: "Pond volume" }).press("ArrowRight");
  expect((await stats()).volumes).toContain(.2);
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  const paused = (await stats()).starts;
  await page.clock.runFor(9000);
  expect((await stats()).starts).toBe(paused);
  await page.getByRole("button", { name: "Resume motion", exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const hidden = (await stats()).starts;
  await page.clock.runFor(9000);
  expect((await stats()).starts).toBe(hidden);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.getByRole("button", { name: "Sound: on", exact: true }).click();
  const muted = (await stats()).starts;
  await page.clock.runFor(9000);
  expect((await stats()).starts).toBe(muted);
});

test("pond offers brown and monochrome starters plus animated pirate and viking unlocks", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch(); const items = await response.json();
    await route.fulfill({ response, json: items.map((item: Record<string, unknown>) => ({ ...item, riskLevel: "NONE", overdue: false, completionStatus: "NO", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY" })) });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-collection").locator("summary").click();
  for (const id of ["brown", "bw"]) await expect(page.getByTestId(`pond-reward-${id}`)).toBeEnabled();
  for (const id of ["pirate", "viking"]) await expect(page.getByTestId(`pond-reward-${id}`)).toBeDisabled();
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith("makereadyos.frogPond.collection."))!;
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), readyPeak: 7, feeds: 6 }));
  });
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-collection").locator("summary").click();
  for (const id of ["brown", "bw", "pirate", "viking"]) {
    await page.getByTestId(`pond-reward-${id}`).click();
    const body = page.locator(".frog-body").first();
    await expect.poll(() => body.evaluate(el => getComputedStyle(el).backgroundImage)).toContain(`frog-${id}.png`);
    const initial = await body.evaluate(el => getComputedStyle(el).backgroundPosition);
    await page.clock.runFor(880);
    expect(await body.evaluate(el => getComputedStyle(el).backgroundPosition)).not.toBe(initial);
    const image = await page.evaluate(async id => {
      const img = new Image(); img.src = `/frogs/sprites/frog-${id}.png`; await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, id);
    expect(image).toEqual(id === "brown" ? [512, 512] : [256, 128]);
  }
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await expect.poll(() => page.locator(".frog-body").first().evaluate(el => getComputedStyle(el).backgroundImage)).toContain("frog-viking.png");
  await page.getByTestId("pond-collection").locator("summary").click();
  await page.getByRole("button", { name: "Natural pond", exact: true }).click();
  await expect.poll(() => page.locator(".frog-body").first().evaluate(el => getComputedStyle(el).backgroundImage)).toMatch(/frog-(green|brown)\.png/);
});

test("pond pixel backgrounds load, retain saved themes and fit mobile", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("frog-settings-toggle").click();
  const theme = page.getByTestId("frog-theme");
  await expect(theme.locator("option")).toHaveCount(15);
  for (const id of ["01", "02", "11", "12", "13", "14", "15"]) {
    await theme.selectOption(`pond-${id}`);
    await expect(page.getByTestId("frog-pond-scene")).toHaveCSS("image-rendering", "pixelated");
    const url = `/frogs/ponds/pond-${id}.png?v=pixel-20260907`;
    await expect.poll(() => page.getByTestId("frog-pond-scene").evaluate(el => getComputedStyle(el).backgroundImage)).toContain(url);
    const loaded = await page.evaluate(async url => {
      const image = new Image(); image.src = url; await image.decode();
      return image.naturalWidth > image.naturalHeight && image.naturalWidth >= 1024;
    }, url);
    expect(loaded).toBeTruthy();
  }
  await theme.selectOption("pond-12");
  await page.getByTestId("frog-settings-toggle").click();
  await page.getByTestId("frog-pond-scene").screenshot({ path: "/tmp/mros-pixel-coffee.png" });
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await expect(page.getByTestId("frog-pond-panel")).toHaveClass(/frog-theme-pond-12/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("frog-settings-toggle").click();
  await expect(page.getByTestId("frog-theme")).toHaveValue("pond-12");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByTestId("frog-pond-panel").screenshot({ path: "/tmp/mros-pixel-pond-mobile.png" });
});

test("dropped flies are caught one at a time with a tongue reaching the mouth", async ({ page }) => {
  await page.clock.install();
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-feed").click();
  const food = page.locator(".pond-food-flies i");
  await expect(food).toHaveCount(3);
  await expect(food.first()).toHaveCSS("width", "32px");
  await expect(page.locator(".pond-food-tongue")).toHaveCount(0);
  const counts = new Set([3]);
  let tongueSeen = false;
  let reachedMouth = false;
  let chewingSeen = false;
  for (let tick = 0; tick < 26; tick++) {
    await page.clock.runFor(220);
    counts.add(await food.count());
    const lines = await page.locator(".pond-food-tongue").evaluateAll(els => els.map(el => ({ x1: el.getAttribute("x1"), x2: el.getAttribute("x2"), y1: el.getAttribute("y1"), y2: el.getAttribute("y2") })));
    tongueSeen ||= lines.some(line => line.x1 !== line.x2 || line.y1 !== line.y2);
    reachedMouth ||= tongueSeen && lines.some(line => line.x1 === line.x2 && line.y1 === line.y2);
    chewingSeen ||= await page.locator(".pond-snack-guest.pond-catching .frog-hello").count() > 0;
  }
  expect([...counts].sort()).toEqual([0, 1, 2, 3]);
  expect(tongueSeen && reachedMouth && chewingSeen).toBeTruthy();
  await expect(page.getByTestId("pond-snack-target")).toHaveCount(0);
});

test("tadpoles reach algae and nibble individual flakes without tongues", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch(); const items = await response.json();
    await route.fulfill({ response, json: items.map((item: Record<string, unknown>, index: number) => ({ ...item, riskLevel: "NONE", overdue: false, completionStatus: "NO", vacancyStatus: index < 3 ? "NTV" : "VACANT_NOT_LEASED_NOT_READY" })) });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-food").selectOption("algae");
  await page.getByTestId("pond-feed").click();
  const flakes = page.locator(".pond-food-algae i");
  await expect(flakes).toHaveCount(3);
  await expect(flakes.first()).toHaveCSS("width", "6px");
  await expect(flakes.first()).toHaveCSS("height", "4px");
  await expect(page.locator(".pond-nibbling")).toHaveCount(0);
  const counts = new Set([3]);
  let shrinking = false;
  let nibbling = false;
  for (let tick = 0; tick < 27; tick++) {
    await page.clock.runFor(220);
    counts.add(await flakes.count());
    shrinking ||= await flakes.evaluateAll(els => els.some(el => Number((el as HTMLElement).style.scale) < 1));
    nibbling ||= await page.locator(".pond-nibbling .frog-hello").count() > 0;
    await expect(page.locator(".pond-food-tongue, .pond-nibbling:not(.frog-pose-tadpole), .pond-snack-guest.pond-catching")).toHaveCount(0);
  }
  expect([...counts].sort()).toEqual([0, 1, 2, 3]);
  expect(shrinking && nibbling).toBeTruthy();
  await expect(page.getByTestId("pond-snack-target")).toHaveCount(0);
});

test("pond clicks alternate food and skip unavailable species", async ({ page }) => {
  await page.clock.install();
  let species = "mixed";
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch(); const items = await response.json();
    await route.fulfill({ response, json: items.map((item: Record<string, unknown>, index: number) => ({ ...item, riskLevel: "NONE", overdue: false, completionStatus: "NO", vacancyStatus: species === "tadpoles" || species === "mixed" && index === 0 ? "NTV" : "VACANT_NOT_LEASED_NOT_READY" })) });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  const clickWater = async () => {
    const box = await page.getByTestId("frog-pond-scene").boundingBox();
    await page.getByTestId("frog-pond-scene").click({ position: { x: box!.width / 2, y: 12 } });
  };
  for (const served of ["flies", "algae", "flies"]) {
    await clickWater();
    await expect(page.getByTestId("pond-snack-target")).toHaveClass(new RegExp(`pond-food-${served}`));
    const next = served === "flies" ? "algae" : "flies";
    await expect(page.getByTestId("pond-food")).toHaveValue(next);
    await clickWater();
    await expect(page.getByTestId("pond-food")).toHaveValue(next);
    await page.clock.runFor(6000);
  }
  await page.locator(".frog-marker:not(.frog-pose-tadpole)").first().click();
  await page.getByTestId("pond-feed-selected").click();
  await expect(page.getByTestId("pond-snack-target")).toHaveClass(/pond-food-flies/);
  await expect(page.getByTestId("pond-food")).toHaveValue("algae");
  await page.clock.runFor(6000);
  await page.getByTestId("pond-feed").click();
  await expect(page.getByTestId("pond-snack-target")).toHaveClass(/pond-food-algae/);
  for (const only of ["adults", "tadpoles"]) {
    species = only;
    await page.reload();
    await page.getByTestId("tab-pond").click();
    for (let i = 0; i < 2; i++) {
      await page.getByTestId("pond-feed").click();
      await expect(page.getByTestId("pond-snack-target")).toHaveClass(new RegExp(`pond-food-${only === "adults" ? "flies" : "algae"}`));
      await page.clock.runFor(6000);
    }
  }
});

test("pond journeys stay bounded and tadpoles never croak", () => {
  for (const seed of [0, 1, 2, 3]) {
    expect(pondPads({ x: 50, y: 50 }, 960, 600)).toContainEqual(pondJourney({ x: 50, y: 50 }, seed, 0, false, 960, 600));
    expect(pondPersonality(seed)).toBe(pondPersonality(seed));
  }
  const nearby = [{ id: "baby", x: 50, y: 50, pose: "tadpole" }, { id: "nap", x: 50, y: 50, pose: "sleeping" }, { id: "frog", x: 51, y: 50, pose: "working" }];
  expect(selectPondHunter({ x: 50, y: 50 }, nearby, 1000, 600, new Set())?.id).toBe("frog");
  expect(selectPondHunter({ x: 50, y: 50 }, nearby, 1000, 600, new Set(["frog"]))).toBeUndefined();
  expect(selectPondHunter({ x: 10, y: 10 }, nearby, 1000, 600, new Set())).toBeUndefined();
  for (const width of [320, 960, 1920]) for (const tadpole of [true, false]) for (let tick = 0; tick < 300; tick++) {
    const point = pondJourney({ x: 50, y: 55 }, 47, tick, tadpole, width, 600);
    expect(point.x).toBeGreaterThanOrEqual(4);
    expect(point.x).toBeLessThanOrEqual(96);
    expect(point.y).toBeGreaterThanOrEqual(38);
    expect(point.y).toBeLessThanOrEqual(88);
  }
  const food = { x: 70, y: 70, tick: 9996, guests: ["a"] };
  expect(approachSnack({ x: 50, y: 50 }, food, "a", 4).x).toBe(72);
  expect(approachSnack({ x: 50, y: 50 }, food, "b", 4)).toEqual({ x: 50, y: 50 });
  const algae = { ...food, tick: 0, food: "algae" as const };
  expect(approachSnack({ x: 50, y: 50 }, algae, "a", 8)).toEqual({ x: 72.5, y: 72 });
  expect(approachSnack({ x: 40, y: 40 }, algae, "a", 16)).toEqual({ x: 72.5, y: 72 });
  expect(pondGreeting(true, false)).toBe("bloop!");
  expect(pondGreeting(true, true)).toBe("nibble!");
  expect(pondLight(12)).toBe("day"); expect(pondLight(18)).toBe("dusk"); expect(pondLight(23)).toBe("night");
});

test("pond wardrobe, species feeding, scrapbook and quiet view preserve individual choices", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch(); const items = await response.json();
    await route.fulfill({ response, json: items.map((item: Record<string, unknown>, index: number) => ({ ...item, riskLevel: "NONE", overdue: false, completionStatus: index < 3 ? "YES" : "NO", vacancyStatus: index === 3 ? "NTV" : "VACANT_NOT_LEASED_NOT_READY" })) });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  const adult = page.locator(".frog-marker:not(.frog-pose-tadpole)").first();
  await adult.click();
  const personality = await page.getByTestId("pond-personality").textContent();
  await page.getByTestId("pond-individual-outfit").selectOption("cowboy");
  await expect.poll(() => adult.evaluate(el => getComputedStyle(el).getPropertyValue("--frog-sprite"))).toContain("frog-cowboy.png");
  expect(await page.locator(".frog-marker:not(.frog-pose-tadpole)").nth(1).evaluate(el => getComputedStyle(el).getPropertyValue("--frog-sprite"))).not.toContain("cowboy");
  const pad = page.locator(".pond-resting-pad").first();
  const original = await pad.getAttribute("style");
  await page.clock.runFor(4000);
  await expect(pad).toHaveAttribute("style", original!);
  await expect(page.locator(".frog-lily-pad")).toHaveCount(0);
  await page.locator(".frog-pose-tadpole").first().click();
  await expect(page.getByTestId("pond-individual-outfit")).toHaveCount(0);
  await page.getByTestId("pond-feed-selected").click();
  await expect(page.getByTestId("pond-snack-target")).toHaveClass(/pond-food-algae/);
  await expect(page.locator(".pond-snack-guest:not(.frog-pose-tadpole)")).toHaveCount(0);
  await expect(page.locator(".pond-nibbling")).toHaveCount(0);
  await page.clock.runFor(2200);
  await expect(page.locator(".pond-snack-guest .frog-hello")).toHaveText("nibble!");
  await page.clock.runFor(4000);
  await page.getByTestId("pond-only-toggle").click();
  await expect(page.getByTestId("pond-collection")).toBeHidden();
  await expect(page.getByTestId("pond-only-toggle")).toHaveText("Exit pond-only view");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pond-only-toggle")).toBeFocused();
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await adult.click();
  await expect(page.getByTestId("pond-individual-outfit")).toHaveValue("cowboy");
  await expect(page.getByTestId("pond-personality")).toHaveText(personality!);
  const dated = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("makereadyos.frogPond.collection.")).map(key => JSON.parse(localStorage.getItem(key)!)).some(value => Number.isFinite(Date.parse(value.discovered?.hello))));
  expect(dated).toBeTruthy();
  await page.getByTestId("pond-collection").locator("summary").click();
  await page.getByRole("button", { name: "Natural pond", exact: true }).click();
  await expect(page.getByTestId("pond-individual-outfit")).toHaveValue("inherit");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("natural pond stays hat-free and Rodeo frogs is an earned optional outfit", async ({ page }) => {
  let ready = 2;
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch(); const items = await response.json();
    await route.fulfill({ response, json: items.map((item: Record<string, unknown>, index: number) => ({ ...item, completionStatus: index < ready ? "YES" : "NO", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY", assignedTech: "Test tech", scopeLevel: "MAJOR", riskLevel: "CRITICAL" })) });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  const sheets = async () => {
    await expect(page.locator(".frog-marker").first()).toBeVisible();
    return page.locator(".frog-marker").evaluateAll(els => els.map(el => getComputedStyle(el).getPropertyValue("--frog-sprite")));
  };
  expect((await sheets()).every(sheet => /frog-(green|brown)\.png/.test(sheet))).toBeTruthy();
  await page.getByTestId("pond-collection").locator("summary").click();
  await expect(page.getByTestId("pond-reward-cowboy")).toBeDisabled();
  await expect(page.getByTestId("pond-reward-cowboy")).toContainText("3 ready units together");
  ready = 3;
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-collection").locator("summary").click();
  await expect(page.getByTestId("pond-reward-cowboy")).toBeEnabled();
  expect((await sheets()).every(sheet => /frog-(green|brown)\.png/.test(sheet))).toBeTruthy();
  await page.getByTestId("pond-reward-cowboy").click();
  expect((await sheets()).every(sheet => sheet.includes("frog-cowboy.png"))).toBeTruthy();
  await page.reload();
  await page.getByTestId("tab-pond").click();
  expect((await sheets()).every(sheet => sheet.includes("frog-cowboy.png"))).toBeTruthy();
  await page.getByTestId("pond-collection").locator("summary").click();
  await page.getByRole("button", { name: "Natural pond", exact: true }).click();
  expect((await sheets()).every(sheet => /frog-(green|brown)\.png/.test(sheet))).toBeTruthy();
});

test("pond fly catch shows a tongue and nom before removing the fly", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => .5; });
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch(); const items = await response.json();
    const item = { ...items[0], riskLevel: "NONE", overdue: false, completionStatus: "NO", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY" };
    await route.fulfill({ response, json: [item] });
  });
  await login(page, adminEmail, adminPassword);
  const items = await (await page.request.get("/api/make-ready-items")).json();
  await page.evaluate(id => localStorage.setItem("makereadyos.frogPond.positions", JSON.stringify({ [id]: { x: 50, y: 48 } })), items[0].id);
  await page.getByTestId("tab-pond").click();
  const frog = page.locator(".frog-marker").first();
  await frog.focus();
  let caught = false;
  for (let i = 0; i < 120 && !caught; i++) {
    await page.clock.runFor(220);
    caught = await page.locator(".pond-catching").count() > 0;
  }
  expect(caught).toBeTruthy();
  await expect(frog.locator(".frog-hello")).toHaveText("nom!");
  await expect(page.locator(".pond-catch-tongues line")).toHaveCount(1);
  await page.clock.runFor(440);
  await expect(frog.locator(".frog-hello")).toHaveText("nom!");
  await expect.poll(() => page.locator(".pond-fly").evaluateAll(els => els.some(el => (el as HTMLElement).style.opacity === "0"))).toBeTruthy();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".pond-catch-tongues line")).toHaveCount(0);
});

test("living pond supports tadpoles, targeted snacks, atmosphere and discoveries without changing work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.clock.install();
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch();
    const items = await response.json();
    await route.fulfill({ response, json: items.map((item: Record<string, unknown>, index: number) => ({ ...item, riskLevel: "NONE", overdue: false, completionStatus: "NO", vacancyStatus: index === 0 ? "NTV" : "VACANT_NOT_LEASED_NOT_READY" })) });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  errors.length = 0; // The anonymous auth probe before login intentionally returns 401.
  const mutations: string[] = [];
  page.on("request", req => { if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method()) && req.url().includes("/api/make-ready-items")) mutations.push(req.url()); });
  await expect(page.getByRole("button", { name: "Sound: off", exact: true })).toBeVisible();
  const tadpole = page.locator(".frog-pose-tadpole").first();
  await tadpole.click();
  await expect(tadpole.locator(".frog-hello")).toHaveText("bloop!");
  await expect(page.getByTestId("pond-greeting")).not.toContainText(/ribbit/i);
  await expect(tadpole.locator("strong")).toHaveCSS("opacity", "1");
  await page.getByTestId("frog-settings-toggle").click();
  await page.getByTestId("pond-label-mode").selectOption("always");
  await page.getByTestId("pond-lighting").selectOption("night");
  await page.getByTestId("pond-weather").selectOption("rain");
  await expect(page.getByTestId("frog-pond-panel")).toHaveClass(/pond-light-night/);
  await expect(page.locator(".pond-rain")).toBeVisible();
  await page.getByTestId("pond-feed").click();
  await expect(page.locator(".pond-snack-guest")).toHaveCount(3);
  const foodFly = page.locator(".pond-food-flies i").first();
  await expect(foodFly).toHaveCSS("width", "32px");
  const flySprite = await foodFly.evaluate(el => {
    const sprite = getComputedStyle(el, "::before");
    return { image: sprite.backgroundImage, size: sprite.backgroundSize, animation: sprite.animationName };
  });
  expect(flySprite.image).toContain("/frogs/decor/fly.png");
  expect(flySprite.size).toBe("32px 64px");
  expect(flySprite.animation).toContain("pond-food-flap");
  const guest = page.locator(".pond-snack-guest").last();
  const before = await guest.evaluate(el => (el as HTMLElement).style.left);
  await page.clock.runFor(1800);
  expect(await guest.evaluate(el => (el as HTMLElement).style.left)).not.toBe(before);
  await page.clock.runFor(4400);
  await expect(page.getByTestId("pond-snack-target")).toHaveCount(0);
  await page.clock.runFor(61000);
  const visitor = page.getByTestId("pond-visitor");
  await expect(visitor).toHaveCSS("border-top-width", "0px");
  await expect(visitor).toHaveCSS("border-radius", "0px");
  await expect(visitor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(visitor.locator("svg")).toHaveAttribute("shape-rendering", "crispEdges");
  await expect(visitor.locator(".pond-visitor-wings-open")).toHaveCSS("animation-name", "pond-visitor-flap");
  const wings = await visitor.locator(".pond-visitor-wings-open").evaluate(el => getComputedStyle(el).opacity);
  await page.clock.runFor(80);
  await expect.poll(() => visitor.locator(".pond-visitor-wings-open").evaluate(el => getComputedStyle(el).opacity)).not.toBe(wings);
  await page.keyboard.press("Tab");
  await visitor.focus();
  await expect(visitor).toHaveCSS("outline-style", "dashed");
  await visitor.screenshot({ path: "/tmp/mros-pixel-dragonfly.png" });
  await visitor.press("Enter");
  await page.getByTestId("pond-collection").locator("summary").click();
  await expect(page.getByTestId("pond-reward-purple")).toBeEnabled();
  await page.getByTestId("frog-settings-toggle").click();
  await page.getByTestId("frog-pond-scene").screenshot({ path: "/tmp/mros-living-pond.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByTestId("tab-pond").click();
  await page.getByTestId("pond-collection").locator("summary").click();
  await expect(page.getByTestId("pond-reward-purple")).toBeEnabled();
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test("living pond celebrates a newly ready unit, not initial historical readiness", async ({ page }) => {
  let complete = false;
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch(); const items = await response.json();
    await route.fulfill({ response, json: items.map((item: Record<string, unknown>, index: number) => ({ ...item, completionStatus: index === 0 && complete ? "YES" : "NO", vacancyStatus: "VACANT_NOT_LEASED_NOT_READY" })) });
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("tab-pond").click();
  await expect(page.getByTestId("frog-pond-scene")).toBeVisible();
  await expect(page.getByTestId("pond-celebration")).toHaveCount(0);
  complete = true;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("pond-celebration")).toBeVisible();
});

test("shared dialogs keep keyboard focus inside and return it on Escape", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const opener = page.getByTestId("item-details-ta-284");
  await opener.focus();
  await page.keyboard.press("?");
  const dialog = page.getByTestId("shortcut-help-modal");
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close dialog" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("command search traps keyboard focus and closes from results without losing its opener", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const opener = page.getByTestId("command-palette-button");
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Quick search and commands" });
  const search = dialog.getByRole("textbox", { name: "Search units and commands" });
  await expect(search).toBeFocused();
  const last = dialog.getByRole("button").last();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await search.fill("wiki");
  await page.keyboard.press("Tab");
  await expect(dialog.getByTestId("command-palette-result-wiki")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(search).toHaveValue("");
  await search.fill("no-matching-record-987654321");
  await expect(dialog).toContainText("No matching operational records");
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await page.setViewportSize({ width: 390, height: 500 });
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(500);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
});

for (const module of ["pm", "maps", "projects"] as const) {
  test(`${module} selects a usable property after delayed metadata`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let expectedPropertyId = "";
    await page.route("**/api/meta", async route => {
      const response = await route.fetch();
      expectedPropertyId = (await response.json()).properties[0].id;
      await held;
      return route.fulfill({ response });
    });
    await login(page, adminEmail, adminPassword);
    try {
      await page.getByTestId(module === "maps" ? "tab-maps" : `module-rail-${module}`).click();
      if (module !== "maps") await expect(page.getByRole("heading", { name: "No properties available" })).toBeVisible();
      else await expect(page.getByTestId("property-maps-panel")).toBeVisible();
    } finally { release(); }
    await expect.poll(() => expectedPropertyId).not.toBe("");
    if (module === "pm") {
      await expect(page.getByTestId("preventive-maintenance-panel")).toBeVisible();
      await expect(page.getByLabel("PM property")).toHaveValue(expectedPropertyId);
    } else if (module === "projects") {
      await page.getByTestId("projects-quick-capture-open").click();
      const form = page.getByTestId("projects-quick-capture-form");
      await expect(form.locator("select").nth(1)).toHaveValue(expectedPropertyId);
      await page.getByTestId("projects-quick-capture-title").fill(uniqueTag("Delayed property project"));
      await page.getByTestId("projects-quick-capture-description").fill("Inspect courtyard gate latch");
      const saved = page.waitForResponse(response => response.url().endsWith("/api/projects/records") && response.request().method() === "POST");
      await page.getByTestId("projects-quick-capture-save").click();
      const response = await saved;
      expect(response.request().postDataJSON().propertyId).toBe(expectedPropertyId);
      expect(response.status(), await response.text()).toBe(201);
      await expect(page.getByRole("button", { name: "View Record", exact: true })).toBeVisible();
    } else {
      await expect(page.getByTestId("property-maps-property-select")).toHaveValue(expectedPropertyId);
      const name = uniqueTag("Delayed metadata map");
      await page.getByTestId("property-maps-create-name").fill(name);
      const saved = page.waitForResponse(response => response.url().endsWith("/api/property-maps") && response.request().method() === "POST");
      await page.getByTestId("property-maps-create-submit").click();
      const response = await saved;
      expect(response.request().postDataJSON().propertyId).toBe(expectedPropertyId);
      expect(response.status(), await response.text()).toBe(201);
      await expect(page.getByTestId("property-maps-map-select").locator("option:checked")).toContainText(name);
    }
  });
}

test("lease capture selects a real property after delayed metadata", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let expectedPropertyId = "";
  const overviewProperties: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/lease-compliance/overview") overviewProperties.push(url.searchParams.get("propertyId") ?? "");
  });
  await page.route("**/api/meta", async route => {
    const response = await route.fetch();
    const body = await response.json();
    expectedPropertyId = body.properties[0].id;
    await held;
    return route.fulfill({ response });
  });
  await login(page, adminEmail, adminPassword);
  try {
    await page.getByTestId("module-rail-lease-compliance").click();
    await expect(page.getByRole("heading", { name: "No properties available" })).toBeVisible();
  } finally { release(); }
  await expect.poll(() => expectedPropertyId).not.toBe("");
  await expect(page.getByLabel("Lease Compliance property")).toHaveValue(expectedPropertyId);
  await expect.poll(() => overviewProperties).toContain(expectedPropertyId);
  const description = uniqueTag("Late property lease capture");
  await page.getByTestId("lease-quick-capture-area").fill("Courtyard");
  await page.getByTestId("lease-quick-capture-description").fill(description);
  await expect(page.getByTestId("lease-quick-capture-submit")).toBeDisabled();
  await page.getByTestId("lease-quick-capture-issue-type").selectOption({ label: "Other" });
  const saved = page.waitForResponse(response => response.url().endsWith("/api/lease-compliance/issues") && response.request().method() === "POST");
  await page.getByTestId("lease-quick-capture-submit").click();
  const response = await saved;
  expect(response.request().postDataJSON().propertyId).toBe(expectedPropertyId);
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByTestId("lease-quick-capture-description")).toHaveValue("");
});

test("pool setup requires explicit property selection after delayed metadata", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let expectedPropertyId = "";
  await page.route("**/api/meta", async route => {
    const response = await route.fetch();
    const body = await response.json();
    expectedPropertyId = body.properties[0].id;
    await held;
    return route.fulfill({ response });
  });
  await login(page, adminEmail, adminPassword);
  try {
    await page.getByTestId("module-rail-pool").click();
    await page.getByTestId("pool-tab-setup").click();
    await expect(page.getByTestId("pool-facility-form")).toBeVisible();
  } finally { release(); }
  await expect.poll(() => expectedPropertyId).not.toBe("");
  await expect(page.getByLabel("Pool log property").locator(`option[value="${expectedPropertyId}"]`)).toHaveCount(1);
  await expect(page.getByTestId("pool-facility-submit")).toBeDisabled();
  await page.getByLabel("Pool log property").selectOption(expectedPropertyId);
  await page.getByTestId("pool-facility-name").fill(uniqueTag("Late property pool"));
  const saved = page.waitForResponse(response => response.url().endsWith("/api/pool/facilities") && response.request().method() === "POST");
  await page.getByTestId("pool-facility-submit").click();
  const response = await saved;
  expect(response.request().postDataJSON().propertyId).toBe(expectedPropertyId);
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByTestId("pool-facility-name")).toHaveValue("");
});

test("pool setup save failures stay in the form and preserve entries for retry", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const uncaught: string[] = [];
  page.on("pageerror", error => uncaught.push(error.message));
  let fail = true;
  await page.route("**/api/pool/facilities", route => route.request().method() === "POST" && fail
    ? route.fulfill({ status: 400, json: { message: "Pool name could not be saved" } }) : route.continue());
  await page.getByTestId("module-rail-pool").click();
  await page.getByTestId("pool-tab-setup").click();
  const name = page.getByTestId("pool-facility-name");
  const value = uniqueTag("Retry pool");
  await name.fill(value);
  await page.getByTestId("pool-facility-submit").click();
  await expect(page.getByTestId("pool-facility-form").getByRole("alert")).toContainText("Pool name could not be saved");
  await expect(name).toHaveValue(value);
  await expect(page.getByRole("heading", { name: "Startup error" })).toHaveCount(0);
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
  fail = false;
  await page.getByTestId("pool-facility-submit").click();
  await expect(name).toHaveValue("");
  await expect(page.getByTestId("pool-log-panel")).toContainText(value);
  expect(uncaught).toEqual([]);
});

test("workflow reference search and saves preserve drafts on failure", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  await page.route("**/api/property-wiki/context?**", route => route.fulfill({ json: {
    attached: [], knownIssues: [], suggestions: [], emergencyRecords: [], makeReadyStandards: [],
    related: { sops: [], vendors: [], equipment: [], documents: [] },
  } }));
  let searchFails = true;
  await page.route("**/api/property-wiki/search?**", route => route.fulfill(searchFails
    ? { status: 400, json: { message: "Search unavailable" } }
    : { json: { results: [{ id: "reference-qa", targetType: "ENTRY", propertyId: "qa", title: "Valve location", section: "UTILITIES", snippet: "Behind the building" }] } }));
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/property-wiki/references", async route => {
    await pending;
    await route.fulfill({ status: 400, json: { message: "Could not attach this record" } });
  });
  await page.getByTestId("item-details-ta-284").click();
  const references = page.getByTestId("wiki-workflow-make_ready");
  const search = references.getByRole("textbox", { name: "Search wiki records to attach..." });
  await search.fill("valve");
  await expect(references.getByRole("alert")).toContainText("Search failed.");
  await expect(references).not.toContainText("No wiki matches");
  searchFails = false;
  await references.getByRole("alert").getByRole("button").click();
  const attach = references.getByRole("button", { name: "Attach", exact: true });
  await attach.click();
  await expect(attach).toBeDisabled();
  await expect(search).toBeDisabled();
  release();
  await expect(references.getByRole("alert")).toContainText("Could not save the reference change.");
  await expect(search).toHaveValue("valve");
  await expect(attach).toBeEnabled();
});

test("workflow references retain cached records and show remove failures", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let failRefresh = false;
  const record = { id: "reference-qa", targetType: "ENTRY", propertyId: "qa", title: "Valve location", section: "UTILITIES", snippet: "Behind the building", referenceId: "attached-qa" };
  await page.route("**/api/property-wiki/context?**", route => route.fulfill(failRefresh
    ? { status: 400, json: { message: "References unavailable" } }
    : { json: { attached: [record], knownIssues: [], suggestions: [], emergencyRecords: [], makeReadyStandards: [], related: { sops: [], vendors: [], equipment: [], documents: [] } } }));
  await page.route("**/api/property-wiki/search?**", route => route.fulfill({ json: { results: [record] } }));
  await page.route("**/api/property-wiki/references", route => {
    failRefresh = true;
    return route.fulfill({ json: { reference: { id: "new-reference" } } });
  });
  await page.route("**/api/property-wiki/references/attached-qa", route => route.fulfill({ status: 400, json: { message: "Reference could not be removed" } }));
  await page.getByTestId("item-details-ta-284").click();
  const references = page.getByTestId("wiki-workflow-make_ready");
  await references.getByRole("textbox").fill("valve");
  await references.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(references).toContainText("Previously loaded information may be out of date.");
  await expect(references).toContainText("Valve location");
  await references.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(references).toContainText("Reference could not be removed");
  await expect(references).toContainText("Valve location");
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
});

test("workflow references distinguish loading, failure and empty mobile context", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  let mode = "loading";
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/property-wiki/context?**", async route => {
    if (mode === "loading") await pending;
    if (mode === "error") return route.fulfill({ status: 400, json: { message: "Reference service unavailable" } });
    return route.fulfill({ json: {
      attached: [], knownIssues: [], suggestions: [], emergencyRecords: [], makeReadyStandards: [],
      related: { sops: [], vendors: [], equipment: [], documents: [] },
    } });
  });
  await page.getByTestId("module-rail-refrigerant").click();
  await page.getByTestId("refrigerant-tab-history").click();
  const property = page.getByTestId("refrigerant-panel").getByRole("combobox", { name: "Property", exact: true });
  await property.selectOption({ index: 1 });
  await page.setViewportSize({ width: 412, height: 915 });
  const references = page.getByTestId("wiki-workflow-refrigerant");
  await expect(references).toContainText("Loading property references...");
  mode = "error";
  release();
  await expect(references.getByRole("alert")).toContainText("Could not load property references.");
  mode = "empty";
  await references.getByRole("button").click();
  await expect(references).toHaveCount(0);
  await expect(page.getByTestId("refrigerant-panel")).not.toContainText("No matching wiki records.");
  await expect(page.getByTestId("refrigerant-panel")).toContainText("Recent Refrigerant Activity");
});

test("final walks assign only when ready, appear in My Work and hand off safely", async ({ page, browser }, testInfo) => {
  test.setTimeout(120000);
  const loginResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const response = await loginResponse;
  const origin = new URL(response.url()).origin;
  const { csrfToken } = await response.json();
  const headers = { "x-csrf-token": csrfToken };
  const post = async (path: string, data: unknown) => {
    const result = await page.request.post(`${origin}/api${path}`, { headers, data });
    expect(result.ok(), await result.text()).toBeTruthy(); return result.json();
  };
  const stamp = Date.now();
  const { property } = await post("/operations/properties", { code: `FW${stamp}`, name: "Final Walk Test" });
  const password = "Test-Only-Inspector!123";
  const users = [];
  for (const suffix of ["primary", "backup"]) {
    const { user } = await post("/admin/users", { username: `walk${suffix}${stamp}`, fullName: `Walk ${suffix} ${stamp}`, role: "LEASING", propertyIds: [property.id], password });
    users.push(user);
  }
  const { user: tech } = await post("/admin/users", { username: `walktech${stamp}`, fullName: `Repair Tech ${stamp}`, role: "TECH", propertyIds: [property.id], password });
  const { user: evidenceManager } = await post("/admin/users", { username: `walkmanager${stamp}`, fullName: `Evidence Manager ${stamp}`, role: "MANAGER", propertyIds: [property.id], password });
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "WALK-1" });
  const meta = await (await page.request.get(`${origin}/api/meta`)).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, unitNumber: "WALK-1", itemName: "WALK-1", completionStatus: "NO", vacancyStatus: "VACANT NOT LEASED NOT READY", makeReadyDate: "2099-01-01" });
  expect((await page.request.patch(`${origin}/api/make-ready-items/${item.id}`, { headers, data: { assignedTech: tech.fullName } })).ok()).toBeTruthy();
  const { template } = await post("/checklist-templates", { propertyId: property.id, name: "Tech repair scope", items: [{ title: "Replace and check filter", required: true }] });
  const { instance } = await post(`/make-ready-items/${item.id}/checklists`, { templateId: template.id });
  await page.reload();
  await page.getByTestId("property-filter").selectOption(property.id);
  await page.getByTestId("tab-calendar").click();
  const emptyStart = page.getByTestId("calendar-empty-0");
  await expect(emptyStart).toContainText("Check NTV / Expected Vacate or Vacated dates");
  await emptyStart.getByRole("button", { name: "Set up turn scheduling" }).click();
  await expect(page.getByTestId("turn-scheduling-guide")).toBeVisible();
  await page.getByTestId("tab-automations").click();
  const guide = page.getByTestId("final-walk-guide");
  await guide.getByLabel("Final walks for").selectOption(property.id);
  for (const user of users) await guide.getByLabel("Add inspector").selectOption(user.id);
  await expect(guide.getByRole("status")).toContainText("Unsaved inspector order");
  page.once("dialog", dialog => dialog.dismiss());
  await guide.getByLabel("Final walks for").selectOption("");
  await expect(guide.getByLabel("Final walks for")).toHaveValue(property.id);
  await expect(guide.getByRole("listitem")).toHaveCount(2);
  await guide.getByRole("button", { name: "Save and assign final walks" }).click();
  await expect(guide.getByRole("status").filter({ hasText: "Inspector order saved." })).toContainText("0 final walks assigned");
  await expect(guide.getByText("Unsaved inspector order. Save before leaving this setup.", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 412, height: 915 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await guide.screenshot({ path: testInfo.outputPath("final-walk-setup-mobile.png") });
  const assignmentUrl = `${origin}/api/make-ready-items/${item.id}/final-walk`;
  expect((await (await page.request.get(assignmentUrl)).json()).block).toBeNull();
  const { unit: batchUnit } = await post("/operations/units", { propertyId: property.id, number: "WALK-BATCH" });
  const batchItem = await post("/make-ready-items", { propertyId: property.id, unitId: batchUnit.id, boardGroup: section.key, unitNumber: batchUnit.number, itemName: batchUnit.number, completionStatus: "NO", vacancyStatus: "VACANT NOT LEASED NOT READY" });
  await post("/make-ready-items/batch", { action: "SET_FIELD", ids: [batchItem.id], field: "completionStatus", value: "YES" });
  const batchTurn = await (await page.request.get(`${origin}/api/make-ready-items/${batchItem.id}`)).json();
  expect(batchTurn.makeReadyStatus).toBe("FINAL WALK");
  const batchWalk = await (await page.request.get(`${origin}/api/make-ready-items/${batchItem.id}/final-walk`)).json();
  expect(batchWalk.block.assignedUserId).toBe(users[0].id);
  const bypass = await page.request.patch(`${origin}/api/make-ready-items/${batchItem.id}`, { headers, data: { makeReadyStatus: "DONE" } });
  expect(bypass.status(), await bypass.text()).toBe(409);
  const techContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const techPage = await techContext.newPage();
    const signingIn = techPage.waitForResponse(result => result.url().endsWith("/api/auth/login") && result.request().method() === "POST");
    await techPage.goto("/");
    await techPage.getByTestId("login-email").fill(tech.username);
    await techPage.getByTestId("login-password").fill(password);
    await techPage.getByTestId("login-submit").click();
    await expect(techPage.getByTestId("property-filter")).toBeVisible();
    const techHeaders = { "x-csrf-token": (await (await signingIn).json()).csrfToken };
    await techPage.getByRole("button", { name: /View:/ }).click();
    await techPage.getByTestId("tab-my-work").click();
    const card = techPage.getByTestId(`my-work-item-${item.id}`);
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Open work item", exact: true }).click();
    await techPage.getByTestId("comment-input").fill("Initial scope: replace filter and verify fit.");
    await techPage.getByTestId("comment-submit").click();
    await expect(techPage.getByTestId("comment-list")).toContainText("Initial scope: replace filter");
    const photo = await techPage.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32; canvas.getContext("2d")!.fillRect(0, 0, 32, 32); return canvas.toDataURL("image/png").split(",")[1]; });
    await techPage.getByTestId("initial-walk-upload").setInputFiles([
      { name: "unit-condition.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") },
      { name: "unit-condition.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") },
    ]);
    await expect(techPage.getByTestId("drawer-attachments")).toContainText("2 files");
    await techPage.getByTestId("attachment-gallery-open").click();
    const photoCard = techPage.getByTestId("attachment-card").first();
    await photoCard.getByTestId("attachment-editor-toggle").click();
    await expect(photoCard.getByTestId("attachment-stage-select")).toHaveValue("INITIAL_WALK");
    await photoCard.getByTestId("attachment-charge-toggle").check();
    await photoCard.locator('[data-testid^="attachment-charge-note-"]').fill("Broken cabinet hinge observed before repairs; review for charge eligibility.");
    await photoCard.locator('[data-testid^="attachment-charge-note-"]').blur();
    await techPage.keyboard.press("Escape");
    await techPage.getByTestId("item-drawer-close").click();
    await card.getByRole("button", { name: "Start Work", exact: true }).click();
    await card.getByRole("button", { name: "Open work item", exact: true }).click();
    await techPage.getByTestId("attachment-upload").setInputFiles({ name: "repair-after.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
    await expect(techPage.getByTestId("drawer-attachments")).toContainText("3 files");
    await techPage.getByTestId("turn-materials").getByRole("button", { name: "Add part / material" }).click();
    const material = techPage.getByTestId("turn-material-editor");
    await material.getByLabel("Part / material", { exact: true }).fill("Replacement filter");
    await material.getByRole("combobox", { name: "Status", exact: true }).selectOption("USED");
    await material.getByRole("button", { name: "Save material", exact: true }).click();
    await expect(material).toHaveCount(0);
    await techPage.getByTestId(`checklist-item-${instance.items[0].id}`).check();
    await expect(techPage.getByTestId("drawer-checklists")).toContainText("1/");
    const completeResponse = techPage.waitForResponse(result => result.url().endsWith(`/make-ready-items/${item.id}`) && result.request().method() === "PATCH");
    await techPage.getByTestId("drawer-field-completionStatus").selectOption("YES");
    const complete = await completeResponse;
    expect(complete.ok(), await complete.text()).toBeTruthy();
    await techPage.getByTestId("item-drawer-close").click();
    await card.getByRole("button", { name: "End Work", exact: true }).click();
    await expect(card.getByRole("button", { name: "Start Work", exact: true })).toBeVisible();
    expect((await techContext.request.get(`${origin}/api/final-walk-reports/${property.id}?itemId=${item.id}`)).status()).toBe(403);
    expect((await techContext.request.post(`${origin}/api/make-ready-items/${item.id}/mark-ready`, { headers: techHeaders })).status()).toBe(403);
    await expect.poll(() => techPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally { await techContext.close(); }
  for (const evidenceUser of [users[0], evidenceManager]) {
    const evidenceContext = await browser.newContext();
    try {
      const evidencePage = await evidenceContext.newPage();
      await login(evidencePage, evidenceUser.username, password);
      await evidencePage.getByRole("button", { name: "Open details for WALK-1", exact: true }).click();
      const downloadZip = async (testId: string, expectedCount: number) => {
        const downloading = evidencePage.waitForEvent("download");
        await evidencePage.getByTestId(testId).click();
        const downloaded = await downloading;
        const path = testInfo.outputPath(`${evidenceUser.role}-${testId}.zip`);
        await downloaded.saveAs(path);
        const manifest = JSON.parse(execFileSync("unzip", ["-p", path, "manifest.json"], { encoding: "utf8" }));
        expect(manifest.count).toBe(expectedCount);
        expect(manifest.turnId).toBe(item.id);
        expect(manifest.property.id).toBe(property.id);
        expect(new Set(manifest.attachments.map((entry: any) => entry.zipPath)).size).toBe(expectedCount);
        for (const entry of manifest.attachments) {
          expect(entry.uploaderName).toBe(tech.fullName);
          expect(entry.timestampSource).toContain("not verified camera capture time");
          expect(entry.zipPath).toContain(entry.uploadedAtUtc.replace(/[:.]/g, "-"));
          expect(entry.storedName).toBeUndefined();
          const original = execFileSync("unzip", ["-p", path, entry.zipPath]);
          expect(createHash("sha256").update(original).digest("hex")).toBe(entry.sha256);
          expect(original.subarray(1, 4).toString()).toBe("PNG");
        }
        expect(manifest.attachments.some((entry: any) => entry.chargeCandidate && entry.chargeNote.includes("before repairs"))).toBe(true);
        return manifest;
      };
      const initial = await downloadZip("initial-walk-zip", 2);
      expect(initial.attachments.every((entry: any) => entry.inspectionStage === "INITIAL_WALK")).toBe(true);
      await downloadZip("complete-evidence-zip", 3);
      const csv = await evidenceContext.request.get(`${origin}/api/make-ready-items/${item.id}/charge-report.csv`);
      expect(csv.ok(), await csv.text()).toBeTruthy();
      expect(await csv.text()).toContain("Broken cabinet hinge observed before repairs");
      const printable = await evidenceContext.request.get(`${origin}/api/make-ready-items/${item.id}/charge-report.html`);
      expect(printable.ok(), await printable.text()).toBeTruthy();
      expect(await printable.text()).toContain("Broken cabinet hinge observed before repairs");
    } finally { await evidenceContext.close(); }
  }
  const assigned = await (await page.request.get(assignmentUrl)).json();
  expect(assigned.block.assignedUserId).toBe(users[0].id);
  await page.getByRole("button", { name: /View:/ }).click();
  await page.getByTestId("tab-my-work").click();
  const staffPicker = page.getByTestId("my-work-staff");
  for (const user of users) await expect(staffPicker.locator(`option[value="${user.id}"]`)).toContainText("LEASING");
  await staffPicker.selectOption(users[0].id);
  await expect(page.getByTestId(`my-work-item-${item.id}`)).toBeVisible();
  expect(meta.staff.some((member: any) => member.id === users[0].id)).toBe(false);
  expect(meta.workStaff.some((member: any) => member.id === users[0].id)).toBe(true);
  const contexts = [];
  try {
    for (const user of users) {
      const context = await browser.newContext({ viewport: { width: 412, height: 915 } }); contexts.push(context);
      const staffPage = await context.newPage();
      const signingIn = staffPage.waitForResponse(result => result.url().endsWith("/api/auth/login") && result.request().method() === "POST");
      await staffPage.goto("/");
      await staffPage.getByTestId("login-email").fill(user.username);
      await staffPage.getByTestId("login-password").fill(password);
      await staffPage.getByTestId("login-submit").click();
      await expect(staffPage.getByTestId("property-filter")).toBeVisible();
      const staffHeaders = { "x-csrf-token": (await (await signingIn).json()).csrfToken };
      if (user.id === users[0].id) {
        const notifications = await (await context.request.get(`${origin}/api/notifications`)).json();
        expect(JSON.stringify(notifications)).toContain("Final walk ready for inspection");
        await staffPage.getByRole("button", { name: /View:/ }).click();
        await staffPage.getByTestId("tab-my-work").click();
        const inspectionCard = staffPage.getByTestId(`my-work-item-${item.id}`);
        await expect(inspectionCard.getByRole("button", { name: "Inspect or hand off", exact: true })).toHaveCount(1);
        await expect(inspectionCard.getByRole("button", { name: "Open work item", exact: true })).toHaveCount(0);
        await expect(inspectionCard.locator("progress")).toHaveCount(0);
        await inspectionCard.getByRole("button", { name: "Inspect or hand off", exact: true }).click();
        const controls = staffPage.getByTestId("final-walk-controls");
        await expect(controls.getByLabel("Handoff reason")).toHaveCount(0);
        await controls.getByRole("button", { name: "Cannot do this inspection?", exact: true }).click();
        await expect(controls).toContainText(users[1].fullName);
        await expect.poll(() => staffPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await controls.screenshot({ path: testInfo.outputPath("final-walk-handoff-mobile.png") });
        await controls.getByLabel("Handoff reason").fill("Unavailable for this inspection");
        await controls.getByRole("button", { name: "Hand off to next inspector" }).click();
        await expect(controls).toContainText(`Final walk: ${users[1].fullName}`);
        expect((await context.request.get(`${origin}/api/final-walk-reports/${property.id}?itemId=${item.id}`)).status()).toBe(403);
        const retry = await context.request.post(`${assignmentUrl}/handoff`, { headers: staffHeaders, data: { blockId: assigned.block.id, expectedAssigneeId: user.id, reason: "Duplicate handoff" } });
        expect(retry.status()).toBe(409);
        const denied = await context.request.post(`${origin}/api/make-ready-items/${item.id}/mark-ready`, { headers: staffHeaders });
        expect(denied.status()).toBe(403);
        const work = await (await context.request.get(`${origin}/api/my-work`)).json();
        expect(work.items.some((entry: any) => entry.id === item.id)).toBeFalsy();
      } else {
        const work = await (await context.request.get(`${origin}/api/my-work`)).json();
        expect(work.items.some((entry: any) => entry.id === item.id)).toBeTruthy();
        const end = await context.request.post(`${assignmentUrl}/handoff`, { headers: staffHeaders, data: { blockId: assigned.block.id, expectedAssigneeId: user.id, reason: "No more backups" } });
        expect(end.status()).toBe(409);
        await staffPage.getByRole("button", { name: /View:/ }).click();
        await staffPage.getByTestId("tab-my-work").click();
        await staffPage.getByRole("button", { name: "Inspect or hand off", exact: true }).click();
        await staffPage.getByRole("button", { name: "Inspection details / report", exact: true }).click();
        const report = staffPage.getByTestId("final-report-editor");
        await expect(report.getByTestId("final-report-unit")).toBeDisabled();
        await expect(report.getByTestId("final-report-title")).toHaveCount(0);
        await report.getByTestId("final-report-date").fill("2026-09-08");
        await report.locator("summary").filter({ hasText: "General preparation & HVAC" }).click();
        await report.getByTestId("final-report-result-general-1").selectOption("CHECKED");
        await report.getByTestId("final-report-save-draft").click();
        await expect(report.getByRole("status")).toContainText("Inspection draft saved");
        const root = `${origin}/api/final-walk-reports/${property.id}`;
        const saved = await (await context.request.get(`${root}?itemId=${item.id}`)).json();
        expect(saved.items.map((entry: any) => entry.id)).toEqual([item.id]);
        expect((await context.request.get(root)).status()).toBe(403);
        expect((await context.request.put(`${root}/settings`, { headers: staffHeaders, data: saved.settings })).status()).toBe(403);
        await report.getByTestId("final-report-preview").click();
        const preview = report.frameLocator('iframe[title="Final-walk draft preview"]');
        await expect(preview.locator(".brand")).toContainText("Final Walk Test");
        await expect(preview.locator(".draft")).toContainText("NOT FOR RESIDENT ISSUE");
        const download = staffPage.waitForEvent("download");
        await report.getByTestId("final-report-pdf").click();
        const pdf = await download;
        await pdf.saveAs(testInfo.outputPath("leasing-inspection-draft.pdf"));
        const bytes = readFileSync(testInfo.outputPath("leasing-inspection-draft.pdf"));
        expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
        expect((bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
        await expect.poll(() => staffPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await report.screenshot({ path: testInfo.outputPath("leasing-inspection-mobile.png") });
        expect((await context.request.post(`${origin}/api/make-ready-items/${item.id}/mark-ready`, { headers: staffHeaders })).status()).toBe(409);
        for (const section of saved.sections) {
          const details = report.locator("summary").filter({ hasText: section.title }).locator("..");
          if ((await details.getAttribute("open")) === null) await details.locator("summary").first().click();
          for (const check of saved.checks.filter((entry: any) => entry.section === section.id)) await report.getByTestId(`final-report-result-${check.id}`).selectOption("CHECKED");
        }
        await report.getByTestId("final-report-save-draft").click();
        await expect(report.getByRole("status")).toContainText("Inspection draft saved");
        await report.getByRole("button", { name: "Close dialog" }).click();
        const finishing = staffPage.waitForResponse(result => result.url().endsWith(`/make-ready-items/${item.id}/mark-ready`));
        await staffPage.getByRole("button", { name: "Final walk passed / mark ready", exact: true }).click();
        const done = await finishing;
        expect(done.ok(), await done.text()).toBeTruthy();
        expect((await (await context.request.get(assignmentUrl)).json()).block).toBeNull();
        const repeatCompletion = await page.request.patch(`${origin}/api/make-ready-items/${item.id}`, { headers, data: { completionStatus: "YES" } });
        expect(repeatCompletion.ok(), await repeatCompletion.text()).toBeTruthy();
        expect((await repeatCompletion.json()).makeReadyStatus).toBe("DONE");
        expect((await (await context.request.get(assignmentUrl)).json()).block).toBeNull();
        const completedReport = await context.request.get(`${root}?itemId=${item.id}`);
        expect(completedReport.ok()).toBeTruthy();
        expect((await completedReport.json()).canEditDraft).toBe(false);
        expect((await context.request.put(`${root}/items/${item.id}`, { headers: staffHeaders, data: { version: saved.draft.version, value: saved.draft.value } })).status()).toBe(403);
        expect((await (await context.request.get(assignmentUrl)).json()).reportAvailable).toBe(true);
        const finalData = await (await context.request.get(`${root}?itemId=${item.id}`)).json();
        const exportAfter = await context.request.post(`${root}/preview`, { headers: staffHeaders, data: { itemId: item.id, settings: { ...finalData.settings.value, title: "Unauthorized branding override" }, draft: finalData.draft.value, format: "html" } });
        expect(exportAfter.ok(), await exportAfter.text()).toBeTruthy();
        const exportedHtml = (await exportAfter.json()).html;
        expect(exportedHtml).not.toContain("Unauthorized branding override");
        expect((exportedHtml.match(/class="CHECKED"/g) ?? []).length).toBe(45);
        const finalPdf = await context.request.post(`${root}/preview`, { headers: staffHeaders, data: { itemId: item.id, settings: finalData.settings.value, draft: finalData.draft.value, format: "pdf" } });
        expect(finalPdf.ok(), await finalPdf.text()).toBeTruthy();
        const finalBytes = Buffer.from((await finalPdf.json()).pdfBase64, "base64");
        expect(finalBytes.subarray(0, 4).toString()).toBe("%PDF");
        expect((finalBytes.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
      }
    }
  } finally { for (const context of contexts) await context.close(); }
});

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
  await expect(guide.getByRole("status")).toContainText("Unsaved assignment shares");
  page.once("dialog", dialog => dialog.dismiss());
  await guide.getByLabel("Assign turns for").selectOption(vab.id);
  await expect(guide.getByLabel("Assign turns for")).toHaveValue(ta.id);
  await expect(guide.getByLabel(`Share for ${manager.fullName}`)).toHaveValue("25");
  await expect(guide.getByLabel(`Share for ${tech.fullName}`)).toHaveValue("75");
  await page.route(`**/api${endpoint(ta.id)}`, route => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Assignment save unavailable" }) })
    : route.continue());
  await guide.getByRole("button", { name: "Enable split and assign eligible turns" }).click();
  await expect(guide.getByRole("alert")).toContainText("Assignment save unavailable");
  await expect(guide.getByLabel(`Share for ${manager.fullName}`)).toHaveValue("25");
  await expect(guide.getByRole("status")).toContainText("Unsaved assignment shares");
  await page.unroute(`**/api${endpoint(ta.id)}`);
  let releaseSave!: () => void;
  const heldSave = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route(`**/api${endpoint(ta.id)}`, async route => {
    if (route.request().method() === "PUT") await heldSave;
    await route.continue();
  });
  await page.setViewportSize({ width: 412, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await guide.getByRole("button", { name: "Enable split and assign eligible turns" }).click();
  try { await expect(guide.getByLabel("Assign turns for")).toBeDisabled(); }
  finally { releaseSave(); }
  await expect(guide.getByRole("status")).toContainText("2 turn(s) assigned");
  await page.unroute(`**/api${endpoint(ta.id)}`);
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

test("frog sprite sequences use painted tiles and cycle actions, not just transforms", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const sheets = ["green", "blue", "purple", "brown", "tan", "tophat", "cowboy", "pirate", "viking", "clown", "funnyglasses"];
  for (const name of sheets) {
    const width = ["green", "blue", "purple", "brown"].includes(name) ? 512 : 256;
    const clips = Array.from({ length: 8 }, (_, seed) => ["celebrating", "worried", "sleeping"].flatMap(pose => frogSpriteClips(width, pose, seed))).flat();
    const failures = await page.evaluate(async ({ name, clips }) => {
      const img = new Image(); img.src = `/frogs/sprites/frog-${name}.png`; await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
      const failures: string[] = [];
      for (const clip of clips) {
        const hashes = new Set<string>();
        for (let frame = 0; frame < clip.frames; frame++) {
          const col = clip.startCol + frame;
          const data = ctx.getImageData(col * 32, clip.row * 32, 32, 32).data;
          if (!data.some((value, index) => index % 4 === 3 && value > 0)) failures.push(`${clip.action}: empty tile ${col},${clip.row}`);
          hashes.add(Array.from(data).join(","));
        }
        if (hashes.size < 2) failures.push(`${clip.action}: no pixel variation`);
      }
      return failures;
    }, { name, clips });
    expect(failures, name).toEqual([]);
  }
  await page.getByTestId("tab-pond").click();
  const body = page.locator(".frog-marker:not(.frog-pose-tadpole) .frog-body").first();
  await expect(body).toBeVisible();
  const initial = await body.evaluate(el => getComputedStyle(el).backgroundPosition);
  const action = await body.getAttribute("data-sprite-action");
  await expect.poll(() => body.evaluate(el => getComputedStyle(el).backgroundPosition)).not.toBe(initial);
  await expect.poll(() => body.getAttribute("data-sprite-action"), { timeout: 7000 }).not.toBe(action);
  await page.getByRole("button", { name: "Pause motion", exact: true }).click();
  const paused = await body.evaluate(el => getComputedStyle(el).backgroundPosition);
  await page.waitForTimeout(700);
  expect(await body.evaluate(el => getComputedStyle(el).backgroundPosition)).toBe(paused);
  await page.getByRole("button", { name: "Resume motion", exact: true }).click();
  await expect.poll(() => body.evaluate(el => getComputedStyle(el).backgroundPosition)).not.toBe(paused);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByText("Device reduced-motion setting is on")).toBeVisible();
  const reduced = await body.evaluate(el => getComputedStyle(el).backgroundPosition);
  await page.waitForTimeout(700);
  expect(await body.evaluate(el => getComputedStyle(el).backgroundPosition)).toBe(reduced);
  await expect(page.getByRole("button", { name: "Resume motion", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Play animations anyway", exact: true }).click();
  await expect(page.getByTestId("pond-motion-status")).toHaveText("Animations playing");
  await expect.poll(() => body.evaluate(el => getComputedStyle(el).backgroundPosition)).not.toBe(reduced);
  await expect.poll(() => body.evaluate(el => getComputedStyle(el).animationName)).not.toBe("none");
  await page.getByRole("button", { name: "Use device motion preference", exact: true }).click();
  const stopped = await body.evaluate(el => getComputedStyle(el).backgroundPosition);
  await page.waitForTimeout(700);
  expect(await body.evaluate(el => getComputedStyle(el).backgroundPosition)).toBe(stopped);
});

test("calendar date-only values stay on the saved day in Central time", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "America/Chicago" });
  try {
    const page = await context.newPage();
    await login(page, adminEmail, adminPassword);
    const meta = await (await page.request.get("/api/meta")).json();
    const field = meta.customFields.find((f: any) => f.fieldKey === "turnMaintenanceDate");
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    let itemId = "";
    await page.route("**/api/make-ready-items?*", async route => {
      const response = await route.fetch();
      const items = await response.json();
      itemId = items[0].id;
      await route.fulfill({ response, json: items.map((item: any, index: number) => index ? item : { ...item, customFieldValues: [{ customFieldId: field.id, value: date }] }) });
    });
    await page.reload();
    await page.getByTestId("tab-calendar").click();
    const event = page.getByTestId("calendar-panel-0").getByTestId(`calendar-event-${itemId}`);
    await expect(event).toBeVisible();
    await expect(event.getByTestId(`calendar-projected-${itemId}`)).toHaveCount(0);
    await expect(event.locator("xpath=ancestor::div[contains(@class,'calendar-day')][1]").locator(".calendar-date")).toHaveText(/15$/);
  } finally { await context.close(); }
});

test("assigned work shows upcoming unassigned starts without creating assignments", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken, user } = await (await session).json();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers: { "x-csrf-token": csrfToken }, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const { property } = await post("/operations/properties", { code: `UP${Date.now()}`, name: "Upcoming Work" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const ids: string[] = [];
  for (const [number, vacancyStatus] of [["UPCOMING-1", "NTV LEASED"], ["READY-1", "VACANT LEASED READY"]]) {
    const { unit } = await post("/operations/units", { propertyId: property.id, number });
    const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: number, unitNumber: number, moveOutDate: "2099-09-10", vacancyStatus, completionStatus: "NO" });
    ids.push(item.id);
  }
  const response = await (await page.request.get(`/api/assigned-work?propertyId=${property.id}`)).json();
  expect(response.upcoming.map((turn: any) => turn.sourceId)).toEqual([ids[0]]);
  expect(response.upcoming[0].projected).toBe(true);
  expect(response.upcoming[0].assignedUserName).toBeNull();
  expect(response.summary.totalAssignments).toBe(0);
  const me = user ?? await (await page.request.get("/api/auth/me")).json();
  const filtered = await (await page.request.get(`/api/assigned-work?propertyId=${property.id}&userId=${me.id}`)).json();
  expect(filtered.upcoming).toHaveLength(0);
  await page.reload();
  await page.getByTestId("tab-assigned-work").click();
  const upcoming = page.getByTestId(`upcoming-turn-${ids[0]}`);
  await expect(upcoming).toContainText("Projected");
  await expect(upcoming).toContainText("Unassigned");
  await expect(page.getByTestId(`upcoming-turn-${ids[1]}`)).toHaveCount(0);
  await expect(upcoming.getByRole("button", { name: "Start Work" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await upcoming.getByRole("button", { name: "Open unit" }).click();
  await expect(page.getByTestId("item-drawer")).toBeVisible();
  const saved = await (await page.request.get(`/api/make-ready-items/${ids[0]}`)).json();
  expect(saved.assignedTech).toBeNull();
  expect(saved.customFieldValues).toHaveLength(0);
});

test("My Work forecasts personal upcoming turns without confirming assignments", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken, user } = await (await session).json();
  const headers = { "x-csrf-token": csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const { property } = await post("/operations/properties", { code: `MW${Date.now()}`, name: "Personal Forecast" });
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "PERSONAL-1" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, moveOutDate: "2099-09-10", vacancyStatus: "NTV LEASED", completionStatus: "NO" });
  const policy = { enabled: true, shares: [{ userId: user.id, percent: 100 }] };
  expect((await page.request.put(`/api/automations/turn-assignment/${property.id}`, { headers, data: policy })).ok()).toBeTruthy();
  const first = await (await page.request.get("/api/my-work")).json();
  const forecast = first.forecast.turns.find((turn: any) => turn.id === item.id);
  expect(forecast).toMatchObject({ percent: 100, projectedStart: true });
  expect(forecast.expectedStartDate).toMatch(/^2099-/);
  expect(first.items.some((turn: any) => turn.id === item.id)).toBe(false);
  const second = await (await page.request.get("/api/my-work")).json();
  expect(second.forecast).toEqual(first.forecast);
  expect(second.stats).toEqual(first.stats);
  await page.reload();
  await page.getByTestId("tab-my-work").click();
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.getByTestId(`my-work-forecast-${item.id}`);
  await expect(card).toContainText("Tentative assignment");
  expect(await page.getByTestId("my-work-panel").evaluate(panel => {
    const confirmed = Array.from(panel.querySelectorAll("h3")).find(heading => heading.textContent === "Confirmed assignments");
    const upcoming = panel.querySelector('[data-testid="my-work-upcoming"]');
    return Boolean(confirmed && upcoming && (confirmed.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBeTruthy();
  await expect(card).toContainText(`Expected start: ${forecast.expectedStartDate.slice(0, 10)}`);
  await expect(card.getByRole("button", { name: "Start Work" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await card.getByRole("button", { name: "View unit" }).click();
  await expect(page.getByTestId("item-drawer")).toBeVisible();
  const saved = await (await page.request.get(`/api/make-ready-items/${item.id}`)).json();
  expect(saved.assignedTech).toBeNull();
  expect(saved.customFieldValues).toHaveLength(0);
  expect((await page.request.put(`/api/automations/turn-assignment/${property.id}`, { headers, data: { ...policy, enabled: false } })).ok()).toBeTruthy();
  const paused = await (await page.request.get("/api/my-work")).json();
  expect(paused.forecast.turns.some((turn: any) => turn.id === item.id)).toBe(false);
  expect(paused.forecast.warnings.join(" ")).toContain("paused");
});

test("start calendar projects upcoming unassigned notices across properties without saving dates", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("makereadyos.boardWindowedMode", "true"));
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken } = await (await session).json();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers: { "x-csrf-token": csrfToken }, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const now = new Date();
  const source = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-10`;
  const expected = new Date(`${source}T12:00:00`);
  do { expected.setDate(expected.getDate() + 1); } while ([0, 6].includes(expected.getDay()));
  const ids: string[] = [];
  for (const suffix of ["A", "B"]) {
    const { property } = await post("/operations/properties", { code: `FC${Date.now()}${suffix}`, name: `Forecast ${suffix}` });
    const { unit } = await post("/operations/units", { propertyId: property.id, number: `NOTICE-${suffix}` });
    const meta = await (await page.request.get("/api/meta")).json();
    const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
    const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, moveOutDate: source, vacancyStatus: "NTV LEASED", completionStatus: "NO" });
    ids.push(item.id);
    const saved = await (await page.request.get(`/api/make-ready-items/${item.id}`)).json();
    expect(saved.projectedTurnStartDate.slice(0, 10)).toBe(`${source.slice(0, 8)}${String(expected.getDate()).padStart(2, "0")}`);
    expect(saved.assignedTech).toBeNull();
    expect(saved.vacatedDate).toBeNull();
    expect(saved.customFieldValues).toHaveLength(0);
  }
  await page.reload();
  const calendarItems = page.waitForResponse(response => response.url().includes("/api/make-ready-items") && !new URL(response.url()).searchParams.has("limit") && response.ok());
  await page.getByTestId("tab-calendar").click();
  await calendarItems;
  const panel = page.getByTestId("calendar-panel-0");
  await expect(page.getByTestId("board-window-controls")).toHaveCount(0);
  for (const id of ids) {
    const event = panel.getByTestId(`calendar-event-${id}`);
    await expect(event).toBeVisible();
    await expect(event.getByTestId(`calendar-projected-${id}`)).toHaveText("Projected");
    await expect(event.locator("xpath=ancestor::div[contains(@class,'calendar-day')][1]").locator(".calendar-date")).toHaveText(new RegExp(`${expected.getDate()}$`));
  }
  await expect(page.getByTestId("calendar-date-guide")).toContainText("not just your assignments");
});

test("past-due starts keep unfinished previous-month turns visible without moving dates", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const meta = await (await page.request.get("/api/meta")).json();
  const start = meta.customFields.find((field: any) => field.fieldKey === "turnMaintenanceDate");
  let pendingId = "";
  let completed = false;
  await page.route("**/api/make-ready-items?*", async route => {
    const response = await route.fetch();
    const items = (await response.json()).slice(0, 5);
    pendingId = items[0].id;
    await route.fulfill({ response, json: items.map((item: any, index: number) => ({
      ...item,
      vacancyStatus: index === 2 ? "VACANT_LEASED_READY" : index === 4 ? "OCCUPIED" : "VACANT NOT LEASED NOT READY",
      completionStatus: index === 1 || completed ? "DONE" : "NO",
      isArchived: index === 3,
      customFieldValues: [{ customFieldId: start.id, value: "2000-01-03" }],
    })) });
  });
  await page.reload();
  await page.getByTestId("tab-calendar").click();
  const backlog = page.getByTestId("calendar-past-due-starts");
  await expect(backlog).toBeVisible();
  await expect(backlog.locator("summary")).toHaveText("Past-due starts (1)");
  const entry = backlog.getByTestId(`calendar-past-due-${pendingId}`);
  await expect(entry).toContainText("2000-01-03");
  await page.getByTestId("calendar-panel-0").getByRole("button", { name: "Next", exact: true }).click();
  await expect(entry).toBeVisible();
  await page.setViewportSize({ width: 412, height: 915 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await entry.click();
  await expect(page.getByTestId("item-drawer")).toBeVisible();
  completed = true;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByTestId("tab-calendar").click();
  await expect(backlog).toHaveCount(0);
});

test("schedule separates repair starts from existing finish deadlines by default", async ({ page }) => {
  await login(page, adminEmail, adminPassword);
  const meta = await (await page.request.get("/api/meta")).json();
  const startField = meta.customFields.find((field: any) => field.fieldKey === "turnMaintenanceDate");
  const start = meta.scheduleTracks.find((track: any) => track.sourceField === `custom:${startField.id}`);
  const finish = meta.scheduleTracks.find((track: any) => track.sourceField === "makeReadyDate");
  const moveIn = meta.scheduleTracks.find((track: any) => track.sourceField === "moveInDate");
  const items = await (await page.request.get("/api/make-ready-items")).json();
  const item = items.find((entry: any) => entry.property.code === "TA" && entry.unitNumber === "TA 284");
  expect(item).toBeTruthy();
  expect(item.makeReadyDate).toBeTruthy();
  expect(item.customFieldValues.some((value: any) => value.customFieldId === startField.id && value.value)).toBe(false);
  await page.getByTestId("tab-calendar").click();
  await expect(page.getByTestId("calendar-panel-track-0")).toHaveValue(start.id);
  await expect(page.getByTestId("calendar-panel-track-1")).toHaveValue(moveIn.id);
  await page.getByTestId("calendar-panel-track-0").selectOption(finish.id);
  await expect(page.getByTestId("calendar-panel-track-0").locator("option:checked")).toHaveText("Expected Finish");
  await expect(page.getByTestId("calendar-panel-track-1")).toHaveValue(moveIn.id);
  await page.setViewportSize({ width: 412, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("properties select companies independently and preserve both logos in backups", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken } = await (await session).json();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers: { "x-csrf-token": csrfToken }, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const code = `BRAND${Date.now()}`;
  const { property } = await post("/operations/properties", { code, name: "Branding test property" });
  const { property: other } = await post("/operations/properties", { code: `${code}B`, name: "Unassigned property" });
  await page.reload();
  await page.getByTestId("tab-operations").click();
  await page.getByTestId(`property-row-${code.toLowerCase()}`).click();
  const panel = page.getByTestId("property-branding");
  await expect(panel.getByTestId("branding-company")).toHaveValue("");
  await panel.getByText("Add management company", { exact: true }).click();
  const companyName = `Example management ${Date.now()}`;
  await panel.getByLabel("Company name", { exact: true }).fill(companyName);
  await panel.getByRole("button", { name: "Add company", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Company created");
  const logo = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 40; canvas.height = 40; canvas.getContext("2d")!.fillRect(0, 0, 40, 40); return canvas.toDataURL("image/png"); });
  const file = { name: "logo.png", mimeType: "image/png", buffer: Buffer.from(logo.split(",")[1], "base64") };
  await panel.getByLabel("Property logo", { exact: true }).setInputFiles(file);
  await expect(panel.getByRole("status")).toContainText("Logo preview updated");
  await panel.getByText("Edit shared company branding", { exact: true }).click();
  await panel.getByLabel("Company logo", { exact: true }).setInputFiles(file);
  await expect(panel.getByRole("status")).toContainText("Shared company logo saved");
  for (const width of [1280, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const name = page.getByTestId("property-edit-name");
    await expect(name).toBeVisible();
    const nameBox = await name.boundingBox();
    const brandingBox = await panel.boundingBox();
    expect(nameBox!.height).toBeLessThan(65);
    expect(nameBox!.y).toBeGreaterThanOrEqual(brandingBox!.y + brandingBox!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await page.locator(".property-editor").screenshot({ path: "/tmp/mros-branding-layout-mobile.png" });
  await panel.getByRole("button", { name: "Save property branding", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Property branding saved.");
  const saved = (await (await page.request.get(`/api/property-branding/${property.id}`)).json()).property.branding;
  expect(saved.logo).toBeTruthy(); expect(saved.managementCompany.logo).toBeTruthy(); expect(saved.managementCompany.name).toBe(companyName);
  expect((await (await page.request.get(`/api/property-branding/${other.id}`)).json()).property.branding).toBeNull();
  const backup = await (await page.request.get("/api/admin/export")).json();
  expect(backup.data.managementCompanies.find((entry: any) => entry.name === companyName).logo).toBe(saved.managementCompany.logo);
  expect(backup.data.propertyBranding.find((entry: any) => entry.propertyCode === code).logo).toBe(saved.logo);
  const portable = { ...backup, data: { properties: [{ code: `${code}C`, name: "Restored branding", isActive: true }], units: [], makeReadyItems: [], customFields: [], customFieldOptions: [], customFieldValues: [], savedViews: [], automationRules: [], checklistTemplates: [], comments: [], notes: [], managementCompanies: [{ name: `${companyName} restored`, logo: saved.managementCompany.logo }], propertyBranding: [{ propertyCode: `${code}C`, companyName: `${companyName} restored`, logo: saved.logo }] } };
  const imported = await post("/admin/import", { dryRun: false, mode: "merge", backup: portable });
  expect(imported.summary.managementCompanies.created).toBe(1);
  expect(imported.summary.propertyBranding.created).toBe(1);
  await page.setViewportSize({ width: 412, height: 950 });
  await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
});

test("new properties schedule eligible turns with no activation step", async ({ page }) => {
  const session = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await login(page, adminEmail, adminPassword);
  const { csrfToken } = await (await session).json();
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers: { "x-csrf-token": csrfToken }, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const { property } = await post("/operations/properties", { code: `AUTO${Date.now()}`, name: "Automatic baseline" });
  expect((await post("/automations/turn-setup/preview", { propertyId: property.id })).configured).toBe(5);
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "AUTO-101" });
  const meta = await (await page.request.get("/api/meta")).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, vacatedDate: "2026-09-04", makeReadyDate: "2026-09-30", vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" });
  const { rules } = await (await page.request.get("/api/automations")).json();
  const defaults = rules.filter((rule: any) => rule.propertyId === property.id && rule.templateId?.startsWith("guided-turn:"));
  expect(defaults).toHaveLength(5);
  for (const rule of defaults) {
    expect(rule.enabled).toBe(true);
    // Run the existing scheduled-rule executor without calling the enable endpoint.
    await post(`/automations/${rule.id}/run`, {});
  }
  const saved = await (await page.request.get(`/api/make-ready-items/${item.id}`)).json();
  const start = meta.customFields.find((field: any) => field.fieldKey === "turnMaintenanceDate");
  expect(saved.customFieldValues.find((value: any) => value.customFieldId === start.id)?.value).toBe("2026-09-07");
  expect(saved.flooringDate).toContain("2026-09-10");
  expect(saved.makeReadyDate).toContain("2026-09-30");
  expect(saved.completionStatus).toBe("NO");
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
  // A fresh property is usable without ever submitting the guide's enable action.
  const baseline = await post("/automations/turn-setup/preview", { propertyId: property.id });
  expect(baseline.configured).toBe(5);
  expect(baseline.calendar.noWeekendScheduling).toBe(true);
  const { unit } = await post("/operations/units", { propertyId: property.id, number: "TURN-101" });
  const meta = await (await page.request.get(`${origin}/api/meta`)).json();
  const section = meta.boardSections.find((entry: any) => entry.propertyId === property.id && entry.sectionType === "MAKE_READY");
  const initialStart = meta.customFields.find((field: any) => field.fieldKey === "turnMaintenanceDate");
  expect(initialStart).toBeTruthy();
  expect(meta.scheduleTracks.find((track: any) => track.sourceField === `custom:${initialStart.id}`).displayName).toBe("Make Ready (Start)");
  expect(meta.scheduleTracks.find((track: any) => track.sourceField === "makeReadyDate").displayName).toBe("Expected Finish");
  const item = await post("/make-ready-items", { propertyId: property.id, unitId: unit.id, boardGroup: section.key, itemName: unit.number, unitNumber: unit.number, vacatedDate: "2026-09-04", vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" });
  const skipped: string[] = [];
  for (const status of ["DONE", "ARCHIVED", "READY", "NTV", "OCCUPIED"]) {
    const { unit: other } = await post("/operations/units", { propertyId: property.id, number: `TURN-${status}` });
    const skip = await post("/make-ready-items", { propertyId: property.id, unitId: other.id, boardGroup: section.key, itemName: other.number, unitNumber: other.number, vacatedDate: "2026-09-04", vacancyStatus: status === "READY" ? "VACANT LEASED READY" : status === "NTV" ? "NTV LEASED" : status === "OCCUPIED" ? "OCCUPIED" : "VACANT NOT LEASED NOT READY", completionStatus: status === "DONE" ? "DONE" : null });
    skipped.push(skip.id);
    if (status === "ARCHIVED") await post("/make-ready-items/batch", { action: "ARCHIVE", ids: [skip.id] });
  }
  await page.reload();
  await page.getByTestId("tab-automations").click();
  await expect(page.getByTestId("turn-scheduling-guide")).toBeVisible();
  await expect(page.getByTestId("automation-template-library")).not.toBeVisible();
  await page.getByTestId("turn-setup-property").selectOption(property.id);
  const scheduleGuide = page.getByTestId("turn-scheduling-guide");
  await scheduleGuide.getByLabel("Make Ready (Start) days", { exact: true }).fill("2");
  await scheduleGuide.getByLabel("Painting days", { exact: true }).fill("3");
  await scheduleGuide.getByLabel("Cleaning days", { exact: true }).fill("2");
  await expect(scheduleGuide).toContainText("9 working days total");
  await expect(scheduleGuide).toContainText("Planned work: days 3-5");
  await expect(scheduleGuide).toContainText("Finish target: working day 5");
  await expect(scheduleGuide).toContainText("Only Make Ready (Start) is a start-date calendar");
  await page.getByTestId("turn-setup-preview").click();
  await page.getByText("Review proposed dates (1 of 1 units)").click();
  await expect(scheduleGuide).toContainText("2026-09-17");
  for (const stage of ["Make Ready (Start)", "Painting", "Cleaning"]) await scheduleGuide.getByLabel(`${stage} days`, { exact: true }).fill("1");
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
  expect(saved.customFieldValues.find((value: any) => value.customFieldId === initialStart.id)?.value).toBe("2026-09-07");
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
  await expect(page.getByTestId("calendar-panel-track-0").locator("option:checked")).toHaveText("Make Ready (Start)");
  await expect(page.getByTestId("calendar-panel-track-4").locator("option:checked")).toHaveText("Expected Finish");
  await post("/automations/turn-setup/pause", { propertyId: property.id });
  const paused = await post("/automations/turn-setup/preview", { propertyId: property.id });
  expect(paused.configured).toBe(0);
  expect(paused.changes).toBe(0);
  const customDays = [2, 3, 2, 1, 1];
  await post("/automations/turn-setup/enable", { propertyId: property.id, days: customDays });
  await post("/automations/turn-setup/pause", { propertyId: property.id });
  const persistedPlan = await (await page.request.get(`${origin}/api/automations/turn-setup/${property.id}`)).json();
  expect(persistedPlan.days).toEqual(customDays);
  expect(persistedPlan.configured).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByTestId("tab-automations").click();
  await page.getByTestId("turn-setup-property").selectOption(property.id);
  await expect(scheduleGuide.getByLabel("Make Ready (Start) days", { exact: true })).toHaveValue("2");
  await expect(scheduleGuide.getByLabel("Painting days", { exact: true })).toHaveValue("3");
  await expect(scheduleGuide.getByTestId("turn-saved-plan")).toContainText("0 guided rules enabled");
  const backup = await (await page.request.get(`${origin}/api/admin/export`)).json();
  const calendar = backup.data.operatingCalendars.find((entry: any) => entry.propertyCode === property.code);
  expect(calendar.turnStageDays).toEqual(customDays);
  const restoreCode = `PLAN${Date.now()}`;
  const legacyCode = `${restoreCode}L`;
  const legacyCalendar = { ...calendar, propertyCode: legacyCode };
  delete legacyCalendar.turnStageDays;
  const portable = { ...backup, data: { properties: [{ code: restoreCode, name: "Schedule restore", isActive: true }, { code: legacyCode, name: "Legacy schedule restore", isActive: true }], operatingCalendars: [{ ...calendar, propertyCode: restoreCode }, legacyCalendar], units: [], makeReadyItems: [], customFields: [], customFieldOptions: [], customFieldValues: [], savedViews: [], automationRules: [], checklistTemplates: [], notes: [] } };
  await post("/admin/import", { dryRun: false, backup: portable });
  const restored = await (await page.request.get(`${origin}/api/admin/export`)).json();
  expect(restored.data.operatingCalendars.find((entry: any) => entry.propertyCode === restoreCode).turnStageDays).toEqual(customDays);
  expect(restored.data.operatingCalendars.find((entry: any) => entry.propertyCode === legacyCode).turnStageDays).toEqual([]);
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

for (const module of ["pool", "pest", "lease-compliance", "projects", "pm", "property-wiki"] as const) {
  test(`${module} dashboard can retry in place without discarding capture text`, async ({ page }) => {
    await login(page, adminEmail, adminPassword);
    let fail = true;
    let requests = 0;
    await page.route(`**/api/${module}/overview**`, route => {
      requests++;
      return fail ? route.fulfill({ status: 503, json: { message: "Temporary dashboard outage" } }) : route.continue();
    });
    await page.getByTestId(`module-rail-${module}`).click();
    const error = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: /failed to load/i }) });
    await expect(error).toBeVisible();
    const captureId = module === "pest" ? "pest-quick-add-description"
      : module === "lease-compliance" ? "lease-quick-capture-description"
      : module === "projects" ? "projects-quick-capture-description" : null;
    if (module === "projects") await page.getByTestId("projects-quick-capture-open").click();
    if (captureId) await page.getByTestId(captureId).fill("Keep this unsaved capture after retry");
    let navigations = 0;
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
    const priorRequests = requests;
    fail = false;
    const recovered = page.waitForResponse(response => response.url().includes(`/api/${module}/overview`) && response.request().method() === "GET");
    await error.getByRole("button", { name: "Retry now", exact: true }).click();
    expect((await recovered).status()).toBe(200);
    await expect(error).toHaveCount(0);
    expect(requests).toBeGreaterThan(priorRequests);
    expect(navigations).toBe(0);
    if (captureId) await expect(page.getByTestId(captureId)).toHaveValue("Keep this unsaved capture after retry");
    await expect(page.getByRole("heading", { name: "Startup error" })).toHaveCount(0);
  });
}

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

test("project capture keeps retained photo previews valid and releases removed previews", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    const active = new Set<string>();
    (window as any).__projectPreviewUrls = active;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => { const url = create(value); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); revoke(url); };
  });
  await login(page, adminEmail, adminPassword);
  await page.getByTestId("module-rail-projects").click();
  await page.getByTestId("projects-quick-capture-open").click();
  const upload = page.getByTestId("projects-quick-capture-form").locator('input[type="file"]').last();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const images = page.locator(".projects-capture-preview img");
  await upload.setInputFiles({ name: "first.png", mimeType: "image/png", buffer: bytes });
  await expect(images).toHaveCount(1);
  const first = await images.first().getAttribute("src");
  const usable = (url: string) => page.evaluate(url => fetch(url).then(response => response.ok).catch(() => false), url);
  expect(await usable(first!)).toBe(true);
  await upload.setInputFiles({ name: "second.png", mimeType: "image/png", buffer: bytes });
  await expect(images).toHaveCount(2);
  expect(await usable(first!)).toBe(true);
  const second = await images.last().getAttribute("src");
  await page.locator(".projects-capture-preview").first().getByRole("button", { name: "Remove", exact: true }).click();
  await expect(images).toHaveCount(1);
  expect(await usable(second!)).toBe(true);
  expect(await usable(first!)).toBe(false);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(this, blob => { (window as any).__finishProjectPreview = () => callback(blob); }, type, quality);
    };
  });
  await upload.setInputFiles({ name: "pending.png", mimeType: "image/png", buffer: bytes });
  await expect.poll(() => page.evaluate(() => typeof (window as any).__finishProjectPreview)).toBe("function");
  await page.getByTestId("module-rail-pool").click();
  await page.evaluate(() => (window as any).__finishProjectPreview());
  await expect.poll(() => page.evaluate(() => (window as any).__projectPreviewUrls.size)).toBe(0);
});

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

test("pest quick capture retries remaining photos without creating another issue", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    const state = { created: 0, active: new Set<string>() };
    (window as any).__capturePreviewUrls = state;
    URL.createObjectURL = blob => {
      const url = originalCreate(blob);
      if (blob instanceof File && /^(first|second|document)-evidence\.(png|pdf)$/.test(blob.name)) {
        state.created++; state.active.add(url);
      }
      return url;
    };
    URL.revokeObjectURL = url => { state.active.delete(url); originalRevoke(url); };
  });
  await login(page, adminEmail, adminPassword);
  let creates = 0;
  let issueId = "";
  let uploads = 0;
  let secondStarted = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/pest/issues", async route => {
    if (route.request().method() !== "POST") return route.continue();
    creates++;
    const response = await route.fetch();
    expect(response.ok(), await response.text()).toBeTruthy();
    issueId = (await response.json()).issue.id;
    return route.fulfill({ response });
  });
  await page.route("**/api/pest/issues/*/attachments", async route => {
    if (route.request().method() !== "POST") return route.continue();
    uploads++;
    expect(route.request().url()).toContain(`/issues/${issueId}/attachments`);
    if (uploads === 2) {
      secondStarted = true;
      await held;
      return route.fulfill({ status: 503, json: { message: "Photo service temporarily unavailable" } });
    }
    return route.continue();
  });
  await page.getByTestId("module-rail-pest").click();
  await page.setViewportSize({ width: 390, height: 844 });
  const form = page.getByTestId("pest-quick-add-form");
  await expect(page.getByTestId("pest-control-panel").locator(".module-actions select")).not.toHaveValue("");
  const area = uniqueTag("Photo retry courtyard");
  await page.getByTestId("pest-quick-add-area").fill(area);
  await page.getByTestId("pest-quick-add-description").fill("Record this issue once, with both photos.");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");
  await form.locator('input[type="file"]').last().setInputFiles([
    { name: "first-evidence.png", mimeType: "image/png", buffer: png },
    { name: "second-evidence.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(form.getByAltText("first-evidence.png")).toBeVisible();
  await expect(form.getByAltText("second-evidence.png")).toBeVisible();
  const allocated = await page.evaluate(() => (window as any).__capturePreviewUrls.created);
  await page.getByTestId("pest-quick-add-description").fill("Updated notes must not allocate more photo previews.");
  expect(await page.evaluate(() => (window as any).__capturePreviewUrls.created)).toBe(allocated);
  await page.getByTestId("pest-quick-add-submit").click();
  try {
    await expect.poll(() => secondStarted).toBe(true);
    await expect(page.getByTestId("pest-quick-add-submit")).toBeDisabled();
    await expect(page.getByTestId("pest-control-panel").locator(".module-actions select")).toBeDisabled();
  } finally { release(); }
  await expect(form.getByRole("alert")).toContainText("Issue saved. Retry the remaining photos");
  await expect(form.locator(".selected-media-strip")).not.toContainText("first-evidence.png");
  await expect(form.locator(".selected-media-strip")).toContainText("second-evidence.png");
  await form.screenshot({ path: testInfo.outputPath("pest-photo-retry-mobile.png") });
  await form.getByRole("button", { name: "Retry remaining photos" }).click();
  await expect(page.getByTestId("pest-quick-add-description")).toHaveValue("");
  await expect.poll(() => page.evaluate(() => (window as any).__capturePreviewUrls.active.size)).toBe(0);
  expect(creates).toBe(1);
  expect(uploads).toBe(3);
  const savedResponse = await page.request.get(`/api/pest/issues?q=${encodeURIComponent(area)}`);
  expect(savedResponse.ok(), await savedResponse.text()).toBeTruthy();
  const saved = await savedResponse.json();
  expect(saved.issues).toHaveLength(1);
  expect(saved.issues[0].id).toBe(issueId);
  expect(saved.issues[0].attachments).toHaveLength(2);
  const beforePdf = await page.evaluate(() => (window as any).__capturePreviewUrls.created);
  await form.locator('input[type="file"]').last().setInputFiles({ name: "document-evidence.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 preview-only fixture") });
  await expect(form.locator(".selected-media-strip")).toContainText("document-evidence.pdf");
  expect(await page.evaluate(() => (window as any).__capturePreviewUrls.created)).toBe(beforePdf);
  await form.getByRole("button", { name: "Clear Files", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__capturePreviewUrls.active.size)).toBe(0);
  expect(errors).toEqual([]);
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
  await assertNoPageHorizontalOverflow(page);
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
    await page.getByTestId("frog-pond-scene").scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.getByRole("button", { name: "Arrange frogs", exact: true }).click();
    const anchors = await page.locator('[data-testid^="frog-marker-"]').evaluateAll(elements => elements.map(el => ({ x: (el as HTMLElement).style.left, y: (el as HTMLElement).style.top })));
    expect(new Set(anchors.map(point => point.y)).size).toBe(anchors.length);
    expect(new Set(anchors.map(point => point.x)).size).toBe(anchors.length);
    await page.getByRole("button", { name: "Done arranging", exact: true }).click();
    const initialBox = await frog.boundingBox();
    await expect.poll(async () => {
      const box = await frog.boundingBox();
      return Math.hypot(box!.x - initialBox!.x, box!.y - initialBox!.y);
    }, { timeout: 5000 }).toBeGreaterThan(8);
    const moving = await frog.boundingBox();
    await page.mouse.move(moving!.x + moving!.width / 2, moving!.y + moving!.height / 2);
    const original = await frog.boundingBox();
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
    await page.getByRole("button", { name: "Pause motion", exact: true }).click();
    await page.locator('.frog-marker:not(.frog-pose-tadpole)').first().click();
    await expect(page.getByTestId("pond-greeting")).toContainText("Ribbit!");
    await expect(page.getByTestId("item-drawer")).not.toBeVisible();
    await page.getByTestId("pond-open-unit").click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("item-drawer")).not.toBeVisible();
    await page.getByTestId("frog-pond-scene").screenshot({ path: testInfo.outputPath("pond-desktop.png") });
    await expect(page.getByTestId("frog-pond-panel")).not.toHaveClass(/frog-animated/);
    await page.getByRole("button", { name: "Resume motion", exact: true }).click();
    await expect(page.getByTestId("frog-pond-panel")).toHaveClass(/frog-animated/);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByTestId("frog-pond-panel")).not.toHaveClass(/frog-animated/);
    expect(await frog.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
    await page.setViewportSize({ width: 412, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect.poll(() => page.getByTestId("frog-pond-scene").evaluate(scene => {
      const bounds = scene.getBoundingClientRect();
      return [...scene.querySelectorAll(".frog-marker")].every(el => {
        const box = el.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
      });
    })).toBeTruthy();
    await page.getByTestId("frog-pond-panel").screenshot({ path: testInfo.outputPath("pond-mobile.png") });
    expect(await page.locator('[data-testid^="frog-marker-"]').first().evaluate(el => getComputedStyle(el).touchAction)).toBe("pan-y");
    await page.locator('[data-testid^="frog-marker-"]').first().click();
    await page.getByTestId("pond-open-unit").click();
    await expect(page.getByTestId("item-drawer")).toBeVisible();
  });

  test("pond settings keep controls within their cells when the window narrows", async ({ page }, testInfo) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-pond").click();
    await page.getByTestId("frog-settings-toggle").click();
    for (const width of [1440, 1000, 856, 700, 412, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await expect.poll(() => page.getByTestId("frog-config").evaluate(config => {
        const bounds = config.getBoundingClientRect();
        return config.scrollWidth <= config.clientWidth + 1 && [...config.querySelectorAll("select, input, button")].every(control => {
          const box = control.getBoundingClientRect();
          const parent = control.parentElement!.getBoundingClientRect();
          return box.left >= Math.max(bounds.left, parent.left) - 1 && box.right <= Math.min(bounds.right, parent.right) + 1;
        });
      }), { message: `Pond controls must fit at ${width}px` }).toBeTruthy();
      if (width === 856 || width === 412) await page.getByTestId("frog-config").screenshot({ path: testInfo.outputPath(`pond-settings-${width}.png`) });
    }
    await page.getByTestId("frog-metric-source").selectOption("techWorkload");
    await expect(page.getByTestId("frog-metric-source")).toHaveValue("techWorkload");
    await page.getByTestId("frog-preset-name").fill("Phone pond");
    await page.getByTestId("frog-save-preset").click();
    await expect(page.getByTestId("frog-preset-select").locator("option")).toContainText(["Load preset", "Phone pond"]);
  });

  test("busy pond scatters thirty-three units without rows or clipped mobile targets", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, adminEmail, adminPassword);
    await page.route("**/api/make-ready-items?*", async route => {
      const response = await route.fetch();
      const items = await response.json();
      await route.fulfill({ response, json: Array.from({ length: 33 }, (_, index) => ({
        ...items[index % items.length], id: `pond-fixture-${index}`, unitNumber: `POND-${index + 1}`,
        isArchived: false, completionStatus: "NO", vacancyStatus: index % 3 ? "VACANT LEASED NOT READY" : "VACANT LEASED READY",
      })) });
    });
    await page.reload();
    await page.getByTestId("tab-pond").click();
    const markers = page.locator(".frog-marker");
    await expect(markers).toHaveCount(33);
    // Check resting-pad spacing, not independently roaming frogs mid-journey.
    await page.getByRole("button", { name: "Arrange frogs", exact: true }).click();
    const restingPoints = () => markers.evaluateAll(elements => elements.map(el => {
      const box = el.getBoundingClientRect();
      return { x: box.x, y: box.y };
    }));
    await expect.poll(async () => {
      const points = await restingPoints();
      return Math.min(...points.flatMap((point, index) => points.slice(index + 1).map(other => Math.hypot(point.x - other.x, point.y - other.y))));
    }).toBeGreaterThan(85);
    const points = await restingPoints();
    expect(new Set(points.map(point => Math.round(point.y))).size).toBeGreaterThan(25);
    const distances = points.flatMap((point, index) => points.slice(index + 1).map(other => Math.hypot(point.x - other.x, point.y - other.y)));
    expect(Math.min(...distances)).toBeGreaterThan(85);
    await page.getByTestId("frog-pond-scene").screenshot({ path: testInfo.outputPath("busy-pond-desktop.png") });
    await page.setViewportSize({ width: 412, height: 900 });
    await expect(markers).toHaveCount(9);
    await expect.poll(() => page.getByTestId("frog-pond-scene").evaluate(scene => {
      const bounds = scene.getBoundingClientRect();
      return [...scene.querySelectorAll(".frog-marker")].every(el => {
        const box = el.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
      });
    })).toBeTruthy();
    await page.getByTestId("frog-pond-scene").screenshot({ path: testInfo.outputPath("busy-pond-mobile.png") });
  });

  test("pond collection rewards feeding and remembers the chosen outfit", async ({ page }) => {
    await page.clock.install();
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-pond").click();
    await page.getByTestId("pond-collection").locator("summary").click();
    await expect(page.getByTestId("pond-reward-funnyglasses")).toBeDisabled();
    const mutations: string[] = [];
    page.on("request", request => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) && request.url().includes("/api/make-ready-items")) mutations.push(request.url());
    });
    for (let i = 0; i < 3; i++) {
      await page.getByLabel("Next food (alternates)").selectOption("flies");
      await page.getByTestId("pond-feed").click();
      let chewingSeen = false;
      for (let tick = 0; tick < 30; tick++) {
        await page.clock.runFor(220);
        chewingSeen ||= await page.locator(".pond-snack-guest.pond-catching .frog-body").evaluateAll(elements => elements.some(el => getComputedStyle(el).animationName === "pond-munch"));
      }
      expect(chewingSeen).toBeTruthy();
      await expect(page.getByTestId("pond-feed")).toBeEnabled({ timeout: 5000 });
    }
    await expect(page.getByTestId("pond-reward-funnyglasses")).toBeEnabled();
    await page.getByTestId("pond-reward-funnyglasses").click();
    await expect(page.getByTestId("pond-reward-funnyglasses")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.locator(".frog-marker:not(.frog-pose-tadpole)").first().evaluate(el => getComputedStyle(el).getPropertyValue("--frog-sprite"))).toContain("frog-funnyglasses.png");
    await page.reload();
    await page.getByTestId("tab-pond").click();
    await page.getByTestId("pond-collection").locator("summary").click();
    await expect(page.getByTestId("pond-reward-funnyglasses")).toHaveAttribute("aria-pressed", "true");
    expect(mutations).toEqual([]);
  });

  test("pond collection counts ready units without counting not-ready units", async ({ page }) => {
    let readyUnits = 5;
    await page.route("**/api/make-ready-items?*", async route => {
      const response = await route.fetch();
      const items = await response.json();
      await route.fulfill({ response, json: items.map((item: Record<string, unknown>, index: number) => ({ ...item, completionStatus: "NO", vacancyStatus: index < readyUnits ? "VACANT LEASED READY" : "VACANT LEASED NOT READY" })) });
    });
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-pond").click();
    await page.getByTestId("pond-collection").locator("summary").click();
    await expect(page.getByTestId("pond-reward-tophat")).toBeEnabled();
    await expect(page.getByTestId("pond-reward-blue")).toBeEnabled();
    await expect(page.getByTestId("pond-reward-clown")).toBeDisabled();
    readyUnits = 0;
    await page.reload();
    await page.getByTestId("tab-pond").click();
    await page.getByTestId("pond-collection").locator("summary").click();
    await expect(page.getByTestId("pond-reward-blue")).toBeEnabled();
    await expect(page.getByTestId("pond-reward-clown")).toBeDisabled();
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
    const drawer = page.getByTestId("item-drawer");
    await page.getByTestId("item-drawer-close").focus();
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-search")).toBeFocused();
    await page.getByTestId("command-search").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId("item-drawer-close")).toBeFocused();
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
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("attachment-preview-modal")).toBeHidden();
    await expect(page.getByTestId("attachment-gallery-modal")).toBeVisible();
    await expect(page.getByTestId("attachment-gallery-grid").getByTestId("attachment-preview-trigger").first()).toBeFocused();
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
    await page.getByTestId("calendar-panel-track-0").selectOption({ label: fieldLabel });
    await expect(page.getByTestId("calendar-legend-0")).toBeVisible();
    await expect(page.getByTestId("calendar-track-guidance-0")).toContainText("Risk cues:");
    await expect(page.getByTestId("calendar-track-guidance-0")).toContainText("Compatibility:");
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

    await page.goto("/");
    await expect(page.getByTestId("login-email")).toHaveAttribute("autocomplete", "username");
    await expect(page.getByTestId("login-password")).toHaveAttribute("autocomplete", "current-password");
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-admin").click();
    await expect(page.getByTestId("admin-panel")).toBeVisible();
    await expect(page.getByTestId("admin-create-username")).toHaveAttribute("autocomplete", "section-create-user username");
    await expect(page.getByTestId("admin-create-password")).toHaveAttribute("autocomplete", "section-create-user new-password");

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
    await expect(page.getByTestId("admin-reset-password-input")).toHaveAttribute("autocomplete", "section-reset-user new-password");
    await expect(page.getByTestId("admin-reset-password-input")).toHaveAccessibleName(/reset password/i);
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

  test("admin can preview and install an operational library pack", async ({ page }, testInfo) => {
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("tab-automations").click();
    await page.getByTestId("automation-advanced-toggle").click();
    await expect(page.getByTestId("operational-library")).toBeVisible();
    await expect(page.getByTestId("library-pack-make-ready-operations-starter")).toContainText("Make Ready Operations Starter");

    const previewResponse = page.waitForResponse((response) =>
      response.url().includes("/api/operational-library/preview") && response.request().method() === "POST",
    );
    await page.getByTestId("library-pack-use-make-ready-operations-starter").click();
    const mapping = page.getByTestId("library-mapping-grid");
    for (const width of [1600, 412]) {
      await page.setViewportSize({ width, height: 950 });
      await expect(mapping).toBeVisible();
      const gaps = await mapping.locator(".library-mapping-card").evaluateAll(cards => cards.map(card => {
        const heading = card.querySelector(":scope > strong")!.getBoundingClientRect();
        const description = card.querySelector(":scope > small")!.getBoundingClientRect();
        const list = card.querySelector(".library-mapping-list")!.getBoundingClientRect();
        return Math.max(description.top - heading.bottom, list.top - description.bottom);
      }));
      expect(Math.max(...gaps)).toBeLessThan(20);
      await expect.poll(() => mapping.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
      const firstCard = mapping.locator(".library-mapping-card").first();
      expect((await firstCard.boundingBox())!.height).toBeLessThan(260);
      await firstCard.scrollIntoViewIfNeeded();
      await firstCard.screenshot({ path: testInfo.outputPath(`library-mapping-${width}.png`) });
    }
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
    const panel = page.getByTestId("automation-panel");
    await page.route("**/api/automations/*/run", route => route.fulfill({ json: {
      execution: { mode: "MANUAL", rulesEvaluated: 1, checkedCount: 3, matchedCount: 2, actionCount: 1,
        results: [{ ruleId: "fixture", name: "Readiness check", checkedCount: 3, matchedCount: 2, actionCount: 1, warnings: [], errors: ["Pending parts prevent readiness."] }] },
    } }));
    await page.getByTestId("automation-run-now").click();
    await expect(panel.getByRole("alert")).toContainText("Pending parts prevent readiness.");
    await expect(panel.getByRole("alert")).toContainText("1 actions");
    await expect(panel.locator(".admin-message.success")).toHaveCount(0);
    await page.unroute("**/api/automations/*/run");
    await page.getByTestId("automation-run-now").click();
    await expect(panel.locator(".admin-message.success")).toContainText("Run completed:");
    await expect(panel.getByRole("alert")).toHaveCount(0);
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
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    await login(page, adminEmail, adminPassword);
    await page.getByTestId("module-rail-pool").click();
    await expect(page.getByTestId("pool-log-panel")).toBeVisible();
    await expect(page.getByTestId("pool-report-printable")).toBeVisible();
    await expect(page.getByTestId("pool-export-csv")).toBeVisible();
    await page.getByRole("combobox", { name: "Pool log property" }).selectOption({ index: 1 });

    await page.getByTestId("pool-tab-setup").click();
    const facilityForm = await page.getByTestId("pool-facility-form").elementHandle();
    await page.getByTestId("pool-facility-name").fill(uniqueTag("QA Pool"));
    const facilityResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/facilities") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-facility-submit").click();
    await expect((await facilityResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-chemicals").click();
    // An in-flight facility save must not reset the chemical form after switching tabs.
    expect(await facilityForm!.evaluate(form => form.isConnected)).toBe(false);
    const chemicalName = uniqueTag("QA Cal-Hypo");
    await page.getByTestId("pool-chemical-name").fill(chemicalName);
    await page.route("**/api/pool/chemicals", route => route.request().method() === "POST"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Chemical save unavailable" }) }) : route.continue());
    await page.getByTestId("pool-chemical-submit").click();
    await expect(page.getByTestId("pool-chemical-form").getByRole("alert")).toContainText("Chemical save unavailable");
    await expect(page.getByTestId("pool-chemical-name")).toHaveValue(chemicalName);
    await page.unroute("**/api/pool/chemicals");
    const chemicalResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/chemicals") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-chemical-submit").click();
    await expect((await chemicalResponse).status()).toBe(201);
    const chemicalRow = page.locator(".pool-row").filter({ hasText: chemicalName });
    await page.route("**/api/pool/chemicals/*", route => route.request().method() === "PATCH"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Chemical archive unavailable" }) }) : route.continue());
    await chemicalRow.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(chemicalRow.getByRole("alert")).toContainText("Chemical archive unavailable");
    await expect(chemicalRow.getByRole("button", { name: "Archive", exact: true })).toBeEnabled();
    await page.unroute("**/api/pool/chemicals/*");
    await chemicalRow.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(chemicalRow.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
    await chemicalRow.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(chemicalRow.getByRole("button", { name: "Archive", exact: true })).toBeVisible();

    await page.getByTestId("pool-tab-daily").click();
    await page.getByTestId("pool-reading-ph").fill("8.1");
    await page.getByTestId("pool-reading-free-chlorine").fill("0.4");
    await page.getByTestId("pool-safety-0").selectOption("FAIL");
    await page.locator('select[name="chemicalId"]').selectOption({ label: chemicalName });
    await page.getByTestId("pool-chemical-ounces").fill("70");
    await page.route("**/api/pool/entries", route => route.request().method() === "POST"
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Daily log save unavailable" }) }) : route.continue());
    await page.getByTestId("pool-daily-submit").click();
    await expect(page.getByTestId("pool-daily-form").getByRole("alert")).toContainText("Daily log save unavailable");
    await expect(page.getByTestId("pool-reading-ph")).toHaveValue("8.1");
    await expect(page.getByTestId("pool-safety-0")).toHaveValue("FAIL");
    await expect(page.getByTestId("pool-chemical-ounces")).toHaveValue("70");
    await page.unroute("**/api/pool/entries");
    const entryResponse = page.waitForResponse((response) =>
      response.url().includes("/api/pool/entries") && response.request().method() === "POST",
    );
    await page.getByTestId("pool-daily-submit").click();
    await expect((await entryResponse).status()).toBe(201);

    await page.getByTestId("pool-tab-history").click();
    await expect(page.getByTestId("pool-history-row").first()).toBeVisible();
    await expect(page.getByTestId("pool-history-row").first()).toContainText("4 lb 6 oz");
    const photoFile = { name: "pool-check-photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG2kAAAAASUVORK5CYII=", "base64") };
    await page.route("**/api/pool/entries/*/attachments", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Photo upload unavailable" }) }));
    await page.getByTestId("pool-attachment-upload").first().setInputFiles(photoFile);
    await expect(page.getByTestId("pool-log-panel").getByRole("alert")).toContainText("pool-check-photo.png: Photo upload unavailable");
    await page.unroute("**/api/pool/entries/*/attachments");
    const uploadResponse = page.waitForResponse((response) =>
      response.url().match(/\/api\/pool\/entries\/[^/]+\/attachments$/) !== null && response.request().method() === "POST",
    );
    await page.getByTestId("pool-attachment-upload").first().setInputFiles(photoFile);
    await expect((await uploadResponse).status()).toBe(201);
    await expect(page.getByTestId("pool-history-row").first()).toContainText("pool-check-photo.png");
    await page.getByTestId("pool-tab-chemicals").click();
    await chemicalRow.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(chemicalRow.getByRole("button", { name: "Delete Permanently", exact: true })).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
    await chemicalRow.getByRole("button", { name: "Delete Permanently", exact: true }).click();
    await expect(chemicalRow.getByRole("alert")).toContainText("already referenced by log history");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await chemicalRow.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(chemicalRow.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
    expect(browserErrors).toEqual([]);
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
