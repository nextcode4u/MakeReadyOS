import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("mobile project quotes, internal costs, deadlines and document exports work together", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByTestId("login-email").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByTestId("login-password").fill(process.env.ADMIN_PASSWORD || "ChangeThisAdmin!23456");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("property-filter")).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { "x-csrf-token": session.csrfToken };
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const { property } = await post("/operations/properties", { code: `BID${Date.now()}`, name: "Project commercial fixture" });
  const { record } = await post("/projects/records", { propertyId: property.id, recordType: "Project", title: "Roof and shop project", status: "Planning", executionType: "Hybrid", estimatedCost: 99999 });
  const root = `/api/projects/records/${record.id}`;
  const put = async (path: string, data: unknown, status = 200) => {
    const response = await page.request.put(`${root}/${path}`, { headers, data });
    expect(response.status(), await response.text()).toBe(status);
    return response.json();
  };
  const alternative = { expectedVersion: 0, scope: "Roof", companyName: "Alternative roofing", amountCents: 900000, status: "Received" };
  const altId = randomUUID();
  await put(`quotes/${altId}`, alternative);
  expect((await put(`quotes/${altId}`, alternative)).alreadySaved).toBe(true);
  await put(`quotes/${altId}`, { ...alternative, amountCents: 800000 }, 409);
  await put(`quotes/${randomUUID()}`, { ...alternative, companyName: "Electrical company", scope: "Lighting", status: "Included", amountCents: 20000 });

  await page.reload();
  await page.getByTestId("property-filter").selectOption(property.id);
  await page.getByTestId("module-rail-projects").click();
  await page.getByRole("button", { name: record.title, exact: true }).first().click();
  const budget = page.getByTestId("project-budget");
  const form = page.getByTestId("project-quote-form");
  await form.getByLabel("Scope / phase", { exact: true }).fill("Roof replacement");
  await form.getByLabel("Vendor / company", { exact: true }).fill("Brand new roofing company");
  await form.getByText("Add this company to Vendors", { exact: true }).click();
  await form.getByLabel("Trade", { exact: true }).fill("Roofing");
  await form.getByRole("button", { name: "Add vendor to this property", exact: true }).click();
  await expect(budget).toContainText("Vendor added");
  await expect(form.getByLabel("Scope / phase", { exact: true })).toHaveValue("Roof replacement");
  await form.getByLabel("Quote total ($)", { exact: true }).fill("1000.25");
  await form.getByLabel(/^Quote status/).selectOption("Included");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
  await form.getByLabel("PDFs and supporting files (multiple allowed)").setInputFiles([
    { name: "roof-quote.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "roof-scope.pdf", mimeType: "application/pdf", buffer: pdf },
  ]);
  await form.getByRole("button", { name: "Save quote & files", exact: true }).click();
  await expect(page.getByTestId("project-quote-upload-results")).toContainText("roof-scope.pdf: Uploaded");
  let saved = await (await page.request.get(`${root}/budget`)).json();
  expect(saved.quotes).toHaveLength(3);
  const roof = saved.quotes.find((quote: any) => quote.scope === "Roof replacement");
  expect(roof.attachments).toHaveLength(2);
  for (const file of roof.attachments) {
    expect(file.quoteId).toBe(roof.id);
    expect(file.attachmentType).toBe("BID");
    const preview = await page.request.get(`/api/projects/attachments/${file.id}/download?inline=true`);
    expect(preview.headers()["content-disposition"]).toContain("inline");
    expect((await preview.body()).equals(pdf)).toBe(true);
    const download = await page.request.get(`/api/projects/attachments/${file.id}/download`);
    expect(download.headers()["content-disposition"]).toContain("attachment");
  }
  const cost = page.getByTestId("project-cost-form");
  await cost.getByLabel("Description", { exact: true }).fill("Shop technician labor");
  await cost.getByLabel(/^Cost type/).selectOption("Labor");
  await cost.getByLabel("Hours", { exact: true }).fill("2.5");
  await cost.getByLabel("Hourly cost ($)", { exact: true }).fill("35");
  await cost.getByLabel("Actual line total ($)", { exact: true }).fill("0");
  await cost.getByRole("button", { name: "Add cost line", exact: true }).click();
  await expect(budget).toContainText("Cost line saved.");
  saved = await (await page.request.get(`${root}/budget`)).json();
  expect(saved.summary).toMatchObject({ vendorEstimateCents: 120025, inHouseEstimateCents: 8750, plannedCents: 128775, recordedInHouseActualCents: 0, unrecordedActualLines: 0 });
  const schedule = page.getByTestId("project-schedule");
  await schedule.getByLabel("Scheduled start", { exact: true }).fill("2026-10-01");
  await schedule.getByLabel("Project deadline", { exact: true }).fill("2026-10-15");
  await schedule.getByRole("button", { name: "Save schedule", exact: true }).click();
  await expect(schedule).toContainText("Schedule saved.");
  expect((await page.request.patch(root, { headers, data: { dueDate: "2026-10-20", expectedUpdatedAt: record.updatedAt } })).status()).toBe(409);
  expect((await page.request.patch(root, { headers, data: { dueDate: "2026-09-01" } })).status()).toBe(400);
  const zip = await page.request.get(`${root}/documents.zip`);
  expect(zip.ok(), await zip.text()).toBeTruthy();
  const bytes = await zip.body();
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.includes(Buffer.from("manifest.json"))).toBe(true);
  expect(bytes.includes(Buffer.from("roof-quote.pdf"))).toBe(true);
  expect(bytes.includes(Buffer.from("roof-scope.pdf"))).toBe(true);
  const html = await page.request.get(`${root}/report.html`);
  expect(html.ok()).toBeTruthy();
  expect(await html.text()).toContain("Shop technician labor");
  expect(await html.text()).toContain("Roof replacement");
  const report = await page.request.get(`${root}/report.pdf`);
  expect(report.ok(), await report.text()).toBeTruthy();
  expect((await report.body()).subarray(0, 4).toString()).toBe("%PDF");
  const csv = await page.request.get(`/api/projects/export.csv?propertyId=${property.id}`);
  expect(csv.ok()).toBeTruthy();
  expect(await csv.text()).toContain("PlannedSubtotal");
  expect(await csv.text()).toContain("1287.75");
  const exported = await (await page.request.get("/api/admin/export")).json();
  const backupRecord = exported.data.projectRecords.find((entry: any) => entry.title === record.title);
  expect(backupRecord.quotes).toHaveLength(3);
  expect(backupRecord.costLines).toHaveLength(1);
  const quoteIds = new Map(backupRecord.quotes.map((entry: any) => [entry.id, randomUUID()]));
  const copy = { ...backupRecord, title: "Restored project fixture", portableKey: "restored-project-fixture", quotes: backupRecord.quotes.map((entry: any) => ({ ...entry, id: quoteIds.get(entry.id) })), costLines: backupRecord.costLines.map((entry: any) => ({ ...entry, id: randomUUID() })) };
  const attachments = exported.data.projectAttachments.filter((entry: any) => entry.recordKey === backupRecord.portableKey).map((entry: any) => ({ ...entry, recordKey: copy.portableKey, quoteId: quoteIds.get(entry.quoteId), storedName: `restore-fixture/${entry.storedName}` }));
  // Native JSON restores metadata; upload bytes require the separate storage backup.
  const backup = { ...exported, data: { ...Object.fromEntries(Object.keys(exported.data).map(key => [key, []])), projectRecords: [copy], projectAttachments: attachments } };
  const preview = await post("/admin/import", { backup, dryRun: true });
  expect(preview.summary.projectQuotes.created).toBe(3);
  const restored = await post("/admin/import", { backup, dryRun: false });
  expect(restored.summary.projectCostLines.created).toBe(1);
  const projects = await (await page.request.get(`/api/projects/records?propertyId=${property.id}`)).json();
  const restoredId = projects.records.find((entry: any) => entry.title === copy.title).id;
  const restoredBudget = await (await page.request.get(`/api/projects/records/${restoredId}/budget`)).json();
  expect(restoredBudget.summary).toEqual(saved.summary);
  expect(restoredBudget.quotes.find((entry: any) => entry.scope === "Roof replacement").attachments).toHaveLength(2);
  expect((await page.request.get(`/api/projects/records/${restoredId}/documents.zip`)).status()).toBe(409);
  const replay = await post("/admin/import", { backup, dryRun: false });
  expect(replay.summary.projectQuotes.skipped).toBe(3);
  const invalid = await post("/admin/import", { backup: { ...backup, data: { ...backup.data, projectAttachments: [{ ...attachments[0], quoteId: randomUUID() }] } }, dryRun: false });
  expect(invalid.applied).toBe(false);
  expect(invalid.summary.projectAttachments.errors.length).toBeGreaterThan(0);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await budget.evaluate(element => element.scrollIntoView({ block: "start" }));
    const box = await budget.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(width);
    expect(await budget.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: testInfo.outputPath(`project-budget-${width}.png`) });
  }
});
