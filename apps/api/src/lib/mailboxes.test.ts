import { test } from "node:test";
import assert from "node:assert/strict";
import { mailboxImportSchema, mailboxPlan, parseMailboxDirectory } from "./mailboxes.js";
import { defaultReportSettings, emptyReportDraft, finalWalkReportHtml, reportDraftSchema, resolveReportMailbox } from "./finalWalkReport.js";

const units = [{ id: "a", number: "001", mailboxNumber: null }, { id: "b", number: "002", mailboxNumber: "B-02" }];
test("mailbox imports preserve zeroes, quoted commas, tabs and explicit unit-number mode", () => {
  assert.deepEqual(parseMailboxDirectory('unit,mailbox\n001,"Box, 01"'), [{ number: "001", mailbox: "Box, 01" }]);
  assert.deepEqual(parseMailboxDirectory('Unit Number\tMailbox Number\r\n001\t009'), [{ number: "001", mailbox: "009" }]);
  const plan = mailboxPlan("TA", units, mailboxImportSchema.parse({ mode: "UNIT_NUMBER" }));
  assert.equal(plan.changes[0].after, "001");
  assert.deepEqual(plan.changes.map(row => row.action), ["UPDATE", "KEEP"]);
  assert.notEqual(plan.token, mailboxPlan("VAB", units, mailboxImportSchema.parse({ mode: "UNIT_NUMBER" })).token);
});
test("mailbox imports reject unknown and ambiguous units, do not clear blanks, and detect changes", () => {
  const input = mailboxImportSchema.parse({ mode: "DIRECTORY", text: "unit,mailbox\n001,010\n002," });
  const plan = mailboxPlan("TA", units, input);
  assert.deepEqual(plan.changes.map(row => row.action), ["UPDATE", "SKIP"]);
  assert.notEqual(plan.token, mailboxPlan("TA", [{ ...units[0], mailboxNumber: "new" }, units[1]], input).token);
  const duplicates = mailboxPlan("TA", units, { ...input, text: "unit,mailbox\nunknown,1\n001,2\n001,3" });
  assert.equal(duplicates.errors.length, 3);
  assert.equal(duplicates.changes.length, 0);
  assert.equal(mailboxPlan("TA", [...units, { ...units[0], id: "dup" }], input).errors.length, 1);
  assert.throws(() => parseMailboxDirectory('unit,mailbox\n001,"unfinished'));
  assert.throws(() => parseMailboxDirectory('unit,mailbox,code\n001,1,SECRET'));
});
test("numeric mailbox unit matching ignores leading zeroes without guessing ambiguous assignments", () => {
  const directory = [
    { id: "a", number: "011", mailboxNumber: null },
    { id: "b", number: "12", mailboxNumber: null },
    { id: "c", number: "011A", mailboxNumber: null },
  ];
  const input = mailboxImportSchema.parse({ mode: "DIRECTORY", text: "unit,mailbox\n11,009\n0012,010\n011a,A-1" });
  const plan = mailboxPlan("TA", directory, input);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.changes.map(row => [row.number, row.after]), [["011", "009"], ["12", "010"], ["011A", "A-1"]]);
  const duplicate = mailboxPlan("TA", directory, { ...input, text: "unit,mailbox\n11,1\n011,2" });
  assert.equal(duplicate.errors.length, 2);
  assert.equal(duplicate.changes.length, 0);
  const ambiguousUnits = [...directory, { id: "d", number: "11", mailboxNumber: null }];
  const ambiguous = mailboxPlan("TA", ambiguousUnits, { ...input, text: "unit,mailbox\n011,1" });
  assert.equal(ambiguous.errors.length, 1);
  assert.equal(ambiguous.changes.length, 0);
  assert.equal(mailboxPlan("TA", directory, { ...input, text: "unit,mailbox\n11A,1" }).errors.length, 1);
  assert.equal(mailboxPlan("TA", ambiguousUnits, { ...input, mode: "UNIT_NUMBER" }).changes.length, 4);
});
test("reports follow the directory unless explicitly overridden and never print codes by default", () => {
  const context = { propertyName: "Property", propertyCode: "TA", propertyLogo: null, companyName: null, companyLogo: null, unitNumber: "001", technician: null, reviewer: null };
  const draft = reportDraftSchema.parse({ ...emptyReportDraft(), residentDoorCode: 'CODE<123>', residentAccessCode: "RESIDENT-ONLY" });
  assert.equal(resolveReportMailbox(draft, "009").mailbox, "009");
  assert.equal(resolveReportMailbox({ ...draft, mailboxSource: "CUSTOM", mailbox: "" }, "009").mailbox, "");
  assert.equal(resolveReportMailbox({ ...draft, mailboxSource: undefined, mailbox: "legacy" }, "009").mailbox, "legacy");
  assert.equal(finalWalkReportHtml(context, defaultReportSettings, draft).includes("CODE"), false);
  const html = finalWalkReportHtml(context, defaultReportSettings, { ...draft, includeResidentCodes: true });
  assert.ok(html.includes("CODE&lt;123&gt;"));
  assert.ok(html.includes("RESIDENT-ONLY"));
  assert.equal(emptyReportDraft().residentDoorCode, "");
  assert.equal(reportDraftSchema.parse({ ...emptyReportDraft(), residentDoorCode: undefined }).residentDoorCode, "");
});

test("mailbox routes deny staff, API tokens and out-of-scope managers before querying", async () => {
  process.env.ADMIN_USERNAME = "mailbox-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { default: Fastify } = await import("fastify");
  const { mailboxRoutes } = await import("../routes/mailboxes.js");
  const app = Fastify(); let role = "TECH"; let token = false;
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "u", role, propertyAccess: [] } as any; request.authType = token ? "apiToken" : "session"; });
  await app.register(mailboxRoutes);
  try {
    for (const value of ["TECH", "LEASING", "CLEANER", "VIEWER", "MANAGER", "ADMIN"]) {
      role = value; token = value === "ADMIN";
      for (const [method, suffix] of [["GET", ""], ["POST", "/import"], ["PATCH", "/unit"]] as const) {
        const response = await app.inject({ method, url: `/mailboxes/not-assigned${suffix}` });
        assert.equal(response.statusCode, 403, response.body);
      }
    }
  } finally { await app.close(); }
});
