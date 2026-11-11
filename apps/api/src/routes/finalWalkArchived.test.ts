import assert from "node:assert/strict";
import test from "node:test";

test("archived inspection reports remain readable but cannot be edited or exported without evidence", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "report-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { finalWalkReportRoutes } = await import("./finalWalkReports.js");
  const { emptyReportDraft, defaultReportSettings, reportChecks, technicianChecks } = await import("../lib/finalWalkReport.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, key: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[key]; delegate[key] = fn;
    t.after(() => { delegate[key] = original; });
  };
  const draft = { version: 1, updatedAt: "2026-01-01T12:00:00Z", value: { ...emptyReportDraft(), mailbox: "OLD-BOX", mailboxSource: "DIRECTORY" } };
  const item = { id: "turn", propertyId: "demo", unitId: "unit", unitNumber: "101", isArchived: true, completionStatus: "YES", vacancyStatus: "OCCUPIED", makeReadyStatus: "DONE", assignedTech: "Demo Tech", checklistInstances: [], finalWalkReportDraft: { payload: draft } };
  stub(prisma.makeReadyItem, "findFirst", async ({ where }) => where.isArchived === false ? null : item);
  stub(prisma.makeReadyItem, "findMany", async () => [item]);
  stub(prisma.property, "findFirst", async () => ({ id: "demo", name: "Demo Property", code: "DEMO", isActive: true, branding: null, operatingCalendar: null }));
  stub(prisma.unit, "findFirst", async () => { throw new Error("Archived reports must not read today's codes or mailbox"); });
  stub(prisma.workAssignmentBlock, "findFirst", async () => null);
  stub(prisma.auditLog, "create", async () => ({}));
  stub(prisma, "$transaction", async fn => fn(prisma));
  stub(prisma, "$queryRaw", async () => []);
  let role = "MANAGER";
  let propertyAccess = [{ propertyId: "demo" }];
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "manager", fullName: "Demo Manager", role, propertyAccess } as any; });
  await app.register(finalWalkReportRoutes);
  t.after(() => app.close());
  const url = "/final-walk-reports/demo";
  for (const allowed of ["MANAGER", "LEASING", "ADMIN"]) {
    role = allowed;
    const response = await app.inject({ url: `${url}?itemId=turn` });
    assert.equal(response.statusCode, 200, response.body);
    const report = response.json();
    assert.equal(report.canEditDraft, false);
    assert.equal(report.canEditSettings, false);
    assert.equal(report.canMarkOccupied, false);
    assert.equal(report.item.isArchived, true);
    assert.equal(report.draft.value.mailbox, "OLD-BOX");
    const save = await app.inject({ method: "PUT", url: `${url}/items/turn`, payload: { version: 1, value: draft.value } });
    assert.ok([403, 404, 409].includes(save.statusCode), save.body);
  }
  role = "MANAGER";
  const preview = await app.inject({ method: "POST", url: `${url}/preview`, payload: { itemId: "turn", settings: defaultReportSettings, draft: { ...draft.value, mailbox: "FORGED" }, format: "html" } });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.match(preview.json().html, /OLD-BOX/);
  assert.doesNotMatch(preview.json().html, /FORGED/);
  const download = await app.inject({ method: "POST", url: `${url}/items/turn/resident-pdf`, payload: { version: 1 } });
  assert.equal(download.statusCode, 409, download.body);
  assert.match(download.body, /completed inspection records/);
  await t.test("completed archived report generates a PDF without reopening the turn", { skip: !process.env.CHROMIUM_PATH }, async () => {
    Object.assign(draft.value, {
      inspectionDate: "2026-01-01", handoffConfirmed: true,
      homeKeys: "2", mailboxKeys: "1", fobs: "0", remotes: "0",
      results: Object.fromEntries(reportChecks.map(check => [check.id, { status: "CHECKED", note: "" }])),
      technicianResults: Object.fromEntries(technicianChecks.map(check => [check.id, { status: "CHECKED", note: "" }])),
    });
    const pdf = await app.inject({ method: "POST", url: `${url}/items/turn/resident-pdf`, payload: { version: 1 } });
    assert.equal(pdf.statusCode, 200, pdf.body);
    assert.equal(Buffer.from(pdf.json().pdfBase64, "base64").subarray(0, 5).toString(), "%PDF-");
    assert.equal(item.isArchived, true);
  });
  role = "TECH";
  assert.equal((await app.inject({ url: `${url}?itemId=turn` })).statusCode, 403);
  role = "MANAGER";
  propertyAccess = [{ propertyId: "other" }];
  assert.equal((await app.inject({ url: `${url}?itemId=turn` })).statusCode, 403);
});
