import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultReportSettings, emptyReportDraft, finalWalkReportHtml, reportChecks, reportDraftSchema, reportSettingsSchema } from "./finalWalkReport.js";

test("final-walk report keeps 45 grouped checks and separate service checks", () => {
  assert.equal(reportChecks.length, 45);
  assert.equal(new Set(reportChecks.map(check => check.id)).size, 45);
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
  const html = finalWalkReportHtml({ propertyName: "<script>bad</script>", propertyCode: "P", companyName: "A & B", propertyLogo: "https://evil.test/logo.png", companyLogo: null, unitNumber: "101", technician: "Tech", reviewer: "Reviewer" }, defaultReportSettings, { ...emptyReportDraft(), followUp: "<img src=x onerror=alert(1)>" });
  assert.ok(html.includes("&lt;script&gt;bad&lt;/script&gt;"));
  assert.ok(html.includes("A &amp; B"));
  assert.ok(!html.includes("https://evil.test"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("NOT FOR RESIDENT ISSUE"));
  assert.equal((html.match(/class="NOT_CHECKED"/g) ?? []).length, 45);
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
      for (const [method, suffix] of [["GET", ""], ["PUT", "/settings"], ["PUT", "/items/item"], ["POST", "/preview"]] as const) {
        const response = await app.inject({ method, url: `/final-walk-reports/outside${suffix}` });
        assert.equal(response.statusCode, 403, response.body);
      }
    }
  } finally { await app.close(); }
});
