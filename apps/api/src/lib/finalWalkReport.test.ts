import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultReportSettings, emptyReportDraft, finalWalkReportHtml, reportChecks, technicianChecks, reportDraftSchema, reportSettingsSchema, residentReportBlockers } from "./finalWalkReport.js";

test("final-walk separates nine presentation checks from eight technician checks", () => {
  assert.equal(reportChecks.length, 9);
  assert.equal(technicianChecks.length, 8);
  assert.equal(new Set(reportChecks.map(check => check.id)).size, 9);
  assert.ok(!reportChecks.some(check => /condensate|GFCI|coils/.test(check.label)));
  assert.ok(technicianChecks.some(check => /condensate/.test(check.label)));
  assert.ok(reportChecks.some(check => check.label.includes("internet")));
  assert.ok(reportChecks.some(check => check.label.includes("Valet trash")));
  assert.ok(!reportChecks.some(check => /Bathroom 1|Bedroom 1/.test(check.label)));
});
test("inspection draft validation preserves unknowns and requires exception reasons", () => {
  assert.equal(reportDraftSchema.safeParse(emptyReportDraft()).success, true);
  for (const status of ["NA", "ATTENTION"] as const) {
    assert.equal(reportDraftSchema.safeParse({ ...emptyReportDraft(), results: { "general-1": { status, note: "" } } }).success, false);
    assert.equal(reportDraftSchema.safeParse({ ...emptyReportDraft(), results: { "general-1": { status, note: "Review needed" } } }).success, true);
  }
  assert.equal(reportDraftSchema.safeParse({ ...emptyReportDraft(), results: { invented: { status: "CHECKED", note: "" } } }).success, false);
  assert.equal(reportDraftSchema.safeParse({ ...emptyReportDraft(), inspectionDate: "2026-02-30" }).success, false);
  assert.equal(reportDraftSchema.safeParse({ ...emptyReportDraft(), signedBy: "fake", accessCode: "1234" }).success, false);
  assert.equal(reportSettingsSchema.safeParse({ ...defaultReportSettings, accent: "red; background:url(https://evil.test)" }).success, false);
});
test("report HTML escapes content, rejects remote logos and never fabricates sign-offs", () => {
  const html = finalWalkReportHtml({ propertyName: "<script>bad</script>", propertyCode: "P", companyName: "A & B", propertyLogo: "https://evil.test/logo.png", companyLogo: null, unitNumber: "101", technician: "Tech", reviewer: "Reviewer" }, defaultReportSettings, { ...emptyReportDraft(), followUp: "legacy private note", technicianFollowUp: "internal deficiency", technicianResolution: "internal resolution" });
  for (const note of ["legacy private note", "internal deficiency", "internal resolution"]) assert.ok(!html.includes(note));
  assert.ok(html.includes("&lt;script&gt;bad&lt;/script&gt;"));
  assert.ok(html.includes("A &amp; B"));
  assert.ok(!html.includes("https://evil.test"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("NOT FOR RESIDENT ISSUE"));
  assert.equal((html.match(/class="NOT_CHECKED"/g) ?? []).length, 17);
  assert.ok(html.includes("Independent sign-off: not recorded"));
});

test("report endpoints reject out-of-scope staff and API tokens before database reads", async () => {
  process.env.ADMIN_USERNAME = "report-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { default: Fastify } = await import("fastify");
  const { finalWalkReportRoutes } = await import("../routes/finalWalkReports.js");
  const app = Fastify();
  let role = "MANAGER";
  let token = false;
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "u", role, propertyAccess: [] } as any; request.authType = token ? "apiToken" : "session"; });
  await app.register(finalWalkReportRoutes);
  try {
    for (const value of ["MANAGER", "LEASING", "TECH", "CLEANER", "VIEWER", "ADMIN"]) {
      role = value; token = value === "ADMIN";
      for (const [method, suffix] of [["GET", ""], ["PUT", "/settings"], ["PUT", "/items/item"], ["POST", "/preview"], ["POST", "/items/item/return-to-tech"], ["POST", "/items/item/resident-pdf"]] as const) {
        const response = await app.inject({ method, url: `/final-walk-reports/outside${suffix}` });
        assert.equal(response.statusCode, 403, response.body);
      }
    }
  } finally { await app.close(); }
});

test("resident report requires evidence and never invents signatures or includes internal notes", () => {
  const context = { propertyName: "Property", propertyCode: "P", companyName: "Company", propertyLogo: null, companyLogo: null, unitNumber: "163", technician: "Tech", reviewer: null };
  const publication = { exportedBy: "Leasing <staff>", exportedAt: "2026-09-15T12:00:00Z", revision: 3 };
  const draft = emptyReportDraft();
  assert.ok(residentReportBlockers(draft).length > 0);
  assert.throws(() => finalWalkReportHtml(context, defaultReportSettings, draft, publication));
  Object.assign(draft, { inspectionDate: "2026-09-15", handoffConfirmed: true, homeKeys: "2", mailboxKeys: "2", fobs: "0", remotes: "0", technicianFollowUp: "private note" });
  for (const check of technicianChecks) draft.technicianResults[check.id] = { status: "CHECKED", note: "" };
  for (const check of reportChecks) draft.results[check.id] = { status: "CHECKED", note: "" };
  assert.deepEqual(residentReportBlockers(draft), []);
  const html = finalWalkReportHtml(context, defaultReportSettings, draft, publication);
  assert.ok(!html.includes("NOT FOR RESIDENT ISSUE"));
  assert.ok(!html.includes("private note"));
  assert.ok(html.includes("Saved revision 3"));
  assert.ok(html.includes("Leasing &lt;staff&gt;"));
  assert.ok(html.includes("not a signed certification"));
  draft.correctionPending = true;
  assert.ok(residentReportBlockers(draft).length);
  draft.correctionPending = false;
  draft.results[reportChecks[0].id].status = "ATTENTION";
  assert.ok(residentReportBlockers(draft).length);
});
