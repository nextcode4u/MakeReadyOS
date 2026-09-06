import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("operational reports preserve matching rows, spreadsheet text, and complete project totals", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "report-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { leaseComplianceRoutes } = await import("./leaseCompliance.js");
  const { pestControlRoutes } = await import("./pestControl.js");
  const { poolLogRoutes } = await import("./poolLog.js");
  const { projectRoutes } = await import("./projects.js");
  const { preventiveMaintenanceRoutes } = await import("./preventiveMaintenance.js");
  const { makeReadyRoutes } = await import("./makeReady.js");
  const { collaborationRoutes } = await import("./collaboration.js");
  const { propertyMapRoutes } = await import("./propertyMaps.js");
  const { default: Fastify } = await import("fastify");
  const property = { id: "a", code: "QA", name: "Report fixtures" };
  const rows = Array.from({ length: 251 }, (_, index) => ({
    id: `record-${index + 1}`, propertyId: "a", property,
    unit: { number: `RECORD${index + 1}` }, facility: { name: `RECORD${index + 1}` },
    issueTypeName: "Broken Blinds", pestType: "Ants", tags: [], photos: [], notes: [],
    attachments: [], safetyChecks: [], chemicalAdditions: [], status: "Open",
    noticeStage: "None", priority: "Normal", source: "Inspection", persistenceCount: 0,
    description: "=1+1",
    createdAt: new Date("2026-09-06"), requestDate: new Date("2026-09-06"), logDate: new Date("2026-09-06"),
  }));
  const stub = (delegate: any, method: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[method];
    delegate[method] = fn;
    t.after(() => { delegate[method] = original; });
  };
  let query: any;
  for (const delegate of [prisma.leaseComplianceIssue, prisma.pestIssue, prisma.poolLogEntry]) {
    stub(delegate, "findMany", async (args: any) => {
      query = args;
      const selected = rows.slice(0, args.take ?? rows.length);
      return delegate === prisma.poolLogEntry ? selected.map(row => ({ ...row, notes: "=1+1" })) : selected;
    });
  }
  stub(prisma.property, "findUnique", async () => property);
  const spreadsheetText = '=1+1\tsecond column\n"quoted"';
  const item = { ...rows[0], unitNumber: "101", applicant: spreadsheetText, customFieldValues: [] };
  stub(prisma.makeReadyItem, "findMany", async () => [item]);
  stub(prisma.makeReadyItem, "findUnique", async () => item);
  stub(prisma.customField, "findMany", async () => []);
  stub(prisma.itemAttachment, "findMany", async () => [{
    id: "attachment", originalName: spreadsheetText, category: spreadsheetText,
    chargeCandidate: true, chargeEstimatedCents: 100, markupAnnotations: [],
  }]);
  stub(prisma.propertyMap, "findUnique", async () => ({
    id: "map", propertyId: "a", property, name: "Map", pins: [{
      id: "pin", title: spreadsheetText, tags: [], linkedRecordType: null,
    }],
  }));
  stub(prisma.projectRecord, "findMany", async () => [{
    ...rows[0], title: spreadsheetText, recordType: "Project", executionType: "Undecided",
  }]);
  stub(prisma.preventiveMaintenanceTask, "findMany", async () => [{
    ...rows[0], taskName: spreadsheetText, status: "COMPLETED",
    dueDate: new Date("2026-09-06"), template: { name: "Template" },
  }]);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "a" }] } as any;
  });
  await app.register(leaseComplianceRoutes);
  await app.register(pestControlRoutes);
  await app.register(poolLogRoutes);
  await app.register(projectRoutes);
  await app.register(preventiveMaintenanceRoutes);
  await app.register(makeReadyRoutes);
  await app.register(collaborationRoutes);
  await app.register(propertyMapRoutes);
  t.after(() => app.close());
  const directory = await mkdtemp(join(tmpdir(), "mros-operational-reports-"));
  const previousChromium = process.env.CHROMIUM_PATH;
  t.after(async () => {
    if (previousChromium === undefined) delete process.env.CHROMIUM_PATH;
    else process.env.CHROMIUM_PATH = previousChromium;
    await rm(directory, { recursive: true, force: true });
  });
  for (const module of ["lease-compliance", "pest", "pool"]) {
    for (const report of ["export.csv", "report.html", ...(process.env.PDF_TEST_CHROMIUM_PATH ? ["report.pdf"] : [])]) {
      if (process.env.PDF_TEST_CHROMIUM_PATH) process.env.CHROMIUM_PATH = process.env.PDF_TEST_CHROMIUM_PATH;
      const response = await app.inject(`/${module}/${report}?propertyId=a`);
      assert.equal(response.statusCode, 200, `${module}/${report}: ${response.body.slice(0, 300)}`);
      assert.equal(query.where.propertyId, "a");
      assert.equal(query.take, undefined, `${module}/${report} must not silently cap matching rows`);
      let content = response.body;
      if (report.endsWith(".pdf")) {
        const path = join(directory, `${module}.pdf`);
        await writeFile(path, response.rawPayload);
        content = execFileSync("pdftotext", ["-raw", path, "-"], { encoding: "utf8" });
      }
      assert.ok(content.replace(/\s+/g, "").includes("RECORD251"), `${module}/${report} omitted the final record`);
      if (report.endsWith(".csv")) assert.ok(content.includes("'=1+1"), `${module} must escape formula-like text`);
    }
  }
  for (const module of ["projects", "pm"]) {
    for (const format of ["csv", "xls"]) {
      const response = await app.inject(`/${module}/export.${format}?propertyId=a`);
      assert.equal(response.statusCode, 200, response.body);
      assert.ok(response.body.includes('"\'=1+1\tsecond column\n""quoted"""'),
        `${module}/${format} must escape formulas and quote tabs, newlines, and quotes`);
    }
  }
  for (const path of [
    "/export/make-ready.csv?propertyId=a",
    "/property-maps/map/export.csv", "/property-maps/map/export.xls",
    "/make-ready-items/item/charge-report.csv",
    "/make-ready-items/item/charge-report.csv?groupBy=category",
  ]) {
    const response = await app.inject(path);
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(response.body.includes('"\'=1+1\tsecond column\n""quoted"""'),
      `${path} must safely preserve formula-like multiline text`);
  }
  stub(prisma.projectCategory, "count", async () => 1);
  stub(prisma.user, "findMany", async () => []);
  const overviewRows = Array.from({ length: 301 }, (_, index) => ({
    ...rows[0], id: `project-${index}`, recordType: "Project", status: "In Progress",
    estimatedCost: 100, attachments: [], priority: index === 300 ? "High" : "Normal",
    scheduledDate: null,
  }));
  stub(prisma.projectRecord, "findMany", async (args: any) => {
    assert.equal(args.where.propertyId, "a");
    assert.ok(args.where.OR, "tech assignment visibility must apply to every overview query");
    if (args.select) {
      assert.equal(args.take, undefined, "totals cannot use the recent-row cap");
      assert.equal(args.where.isArchived, false);
      assert.equal(args.include, undefined);
      return overviewRows;
    }
    assert.equal(args.take, 10, "display lists stay bounded");
    let selected = overviewRows;
    if (args.where.priority) selected = selected.filter(row => row.priority === "High");
    if (args.where.attachments || args.where.scheduledDate) selected = [];
    return selected.slice(0, args.take);
  });
  const overview = await app.inject("/projects/overview?propertyId=a");
  assert.equal(overview.statusCode, 200, overview.body);
  assert.equal(overview.json().summary.inProgress, 301);
  assert.equal(overview.json().summary.estimatedProjectValue, 30100);
  assert.equal(overview.json().recentActivity.length, 10);
  assert.equal(overview.json().highPriorityItems[0].id, "project-300");
  stub(prisma.preventiveMaintenanceTemplate, "findMany", async () => []);
  const pmRows = Array.from({ length: 201 }, (_, index) => ({
    ...rows[0], id: `task-${index}`, status: "COMPLETED", dueDate: new Date("2026-01-01"),
    completedAt: new Date(Date.now() - (201 - index) * 1000), template: { name: "Template" },
  }));
  stub(prisma.preventiveMaintenanceTask, "findMany", async (args: any) => {
    assert.equal(args.where.propertyId, "a");
    if (args.select) {
      assert.equal(args.take, undefined);
      assert.equal(args.include, undefined);
      return pmRows;
    }
    assert.ok(args.where.id.in.length <= 30, "only visible task details should be loaded");
    return pmRows.filter(task => args.where.id.in.includes(task.id));
  });
  const pmOverview = await app.inject("/pm/overview?propertyId=a");
  assert.equal(pmOverview.statusCode, 200, pmOverview.body);
  assert.equal(pmOverview.json().summary.completedThisMonth, 201);
  assert.equal(pmOverview.json().summary.completionRate, 100);
  assert.equal(pmOverview.json().compliance.green, 201);
  assert.equal(pmOverview.json().recentCompletions.length, 10);
  assert.equal(pmOverview.json().recentCompletions[0].id, "task-200");
});
