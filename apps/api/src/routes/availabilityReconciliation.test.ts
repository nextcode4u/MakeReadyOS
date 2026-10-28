import assert from "node:assert/strict";
import test from "node:test";

test("keeping local conflicts imports other rows and never treats preserved units as missing", async t => {
  process.env.DATABASE_URL ||= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME ||= "availability-test";
  process.env.ADMIN_PASSWORD ||= "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET ||= "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { operationsRoutes, availabilityImportSchema } = await import("./operations.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, key: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[key]; delegate[key] = fn; t.after(() => { delegate[key] = original; });
  };
  const ready = (number: string) => ({
    id: `turn-${number}`, unitId: `unit-${number}`, unitNumber: number, propertyId: "demo", isArchived: false,
    boardGroup: "ready", vacancyStatus: "VACANT LEASED READY", completionStatus: "YES", makeReadyStatus: "DONE",
    applicant: null, moveOutDate: null, vacatedDate: null, makeReadyDate: null, daysVacant: 0,
    moveInDate: new Date("2020-01-01"), createdAt: new Date("2019-01-01"), updatedAt: new Date("2020-01-01"),
    unit: { isActive: true, occupancyStatus: "VACANT LEASED READY" },
  });
  const units = [ready("101"), ready("103")];
  const updates: string[] = []; const audits: any[] = [];
  stub(prisma.property, "findUnique", async () => ({ id: "demo", code: "DG", name: "Demo Gardens", isActive: true }));
  stub(prisma.boardSection, "findMany", async () => [{ key: "ready", sectionType: "READY" }, { key: "work", sectionType: "MAKE_READY" }, { key: "archive", sectionType: "ARCHIVE" }]);
  // Unit 103 becomes a conflict after the initial review; the transaction must protect it too.
  stub(prisma.makeReadyItem, "findMany", async ({ where }: any) => where.unitNumber ? [units[0]] : units);
  stub(prisma.makeReadyItem, "findFirst", async ({ where }: any) => units.find(item => item.unitNumber === where.OR[0].unitNumber) ?? null);
  stub(prisma.floorPlan, "findMany", async () => []);
  stub(prisma.unit, "findUnique", async ({ where }: any) => ({ id: `unit-${where.propertyId_number.number}` }));
  stub(prisma.unit, "update", async ({ where }: any) => { updates.push(where.id); return { id: where.id }; });
  stub(prisma.makeReadyItem, "update", async () => { throw new Error("A preserved turn must not change or be archived"); });
  stub(prisma.auditLog, "create", async ({ data }: any) => { audits.push(data); return data; });
  stub(prisma, "$queryRaw", async () => []);
  stub(prisma, "$transaction", async (fn: any) => fn(prisma));
  const app = Fastify(); app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "demo" }] } as any; });
  await app.register(operationsRoutes); t.after(() => app.close());
  const input = { propertyId: "demo", createTurns: false, rows: ["101", "102", "103"].map(number => ({ number, vacancyStatus: "VACANT NOT LEASED NOT READY" })) };
  const submit = (extra: object) => app.inject({ method: "POST", url: "/operations/availability/import", payload: { ...input, ...extra } });
  assert.equal(availabilityImportSchema.safeParse({ ...input, keepLocalConflicts: true, overrideConflicts: true }).success, false);
  assert.equal((await submit({})).statusCode, 409);
  assert.deepEqual(updates, [], "Review alone must not apply rows");
  const preview = await submit({ fullReport: true, previewOnly: true, reportDate: "2026-01-01" });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.deepEqual(preview.json().candidates, []);
  const result = await submit({ keepLocalConflicts: true, fullReport: true, reportDate: "2026-01-01", archivePreviewToken: preview.json().token });
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(result.json().preservedUnits, ["101", "103"]);
  assert.deepEqual(updates, ["unit-102"]);
  assert.equal(result.json().summary.skipped, 2);
  assert.equal(result.json().summary.turnsArchived, 0);
  assert.deepEqual(audits.at(-1).metadata.preservedUnits, ["101", "103"]);
  updates.length = 0;
  assert.equal((await submit({ overrideConflicts: true })).statusCode, 200);
  assert.deepEqual(updates, ["unit-101", "unit-102", "unit-103"], "Explicit override still works");
});

test("availability readiness is separate from technician completion", async () => {
  process.env.DATABASE_URL ||= "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME ||= "availability-test";
  process.env.ADMIN_PASSWORD ||= "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET ||= "test-only-session-secret-12345678901234567890";
  const { buildAvailabilityConflict } = await import("./operations.js");
  const turn = {
    id: "demo-turn", unitNumber: "101", vacancyStatus: "VACANT NOT LEASED NOT READY",
    applicant: null, moveOutDate: null, vacatedDate: null, makeReadyDate: null, moveInDate: null,
    makeReadyStatus: "DONE", completionStatus: "NO", boardGroup: "make-ready", daysVacant: 5,
    createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-10"),
  };
  const row = { number: "101", makeReadyStatus: "NOT READY", reportDate: "2026-10-09" };
  assert.equal(buildAvailabilityConflict(turn, row, turn.vacancyStatus, turn.boardGroup), null,
    "Technician Done must not conflict with a not-ready report, even after local work updates");
  assert.equal(buildAvailabilityConflict({ ...turn, makeReadyStatus: null }, { ...row, makeReadyStatus: "DONE" }, turn.vacancyStatus, turn.boardGroup), null,
    "Report workflow labels are not technician progress");
  assert.equal(buildAvailabilityConflict({ ...turn, completionStatus: "YES" }, { ...row, makeReadyStatus: "DONE" }, turn.vacancyStatus, turn.boardGroup)?.conflictKind, "LOCAL_AHEAD_READY",
    "Real final approval still needs review even when report says Make Ready Done");
  assert.equal(buildAvailabilityConflict({ ...turn, vacancyStatus: "VACANT_READY" }, row, turn.vacancyStatus, turn.boardGroup)?.conflictKind, "LOCAL_AHEAD_READY");
  assert.equal(buildAvailabilityConflict(turn, { ...row, applicant: "New Demo Applicant" }, turn.vacancyStatus, turn.boardGroup)?.conflictKind, "LOCAL_NEWER",
    "Unrelated stale availability edits remain protected");
});

test("full availability imports preview and atomically archive missing ready units; partial imports do not", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "availability-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { operationsRoutes, unitImportRowSchema } = await import("./operations.js");
  assert.equal(unitImportRowSchema.safeParse({ number: "101", currentResidentMoveInDate: "2024-02-30" }).success, false);
  assert.equal(unitImportRowSchema.parse({ number: "101", currentResidentMoveInDate: "2024-03-15" }).currentResidentMoveInDate?.toISOString(), "2024-03-15T00:00:00.000Z");
  assert.equal(unitImportRowSchema.parse({ number: "101", currentResidentMoveInDate: "" }).currentResidentMoveInDate, undefined);
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, key: string, fn: (...args: any[]) => unknown) => { const original = delegate[key]; delegate[key] = fn; t.after(() => { delegate[key] = original; }); };
  const initial = { id: "missing", unitId: "unit", unitNumber: "011", propertyId: "ta", boardGroup: "ready", vacancyStatus: "VACANT LEASED READY", makeReadyStatus: "DONE", completionStatus: "NO", moveInDate: new Date("2026-09-10"), updatedAt: new Date("2026-09-11"), isArchived: false, unit: { isActive: true, occupancyStatus: "VACANT LEASED READY" } };
  let item = { ...initial, applicant: "Incoming Demo", outgoingResidentName: "Outgoing Demo" }; let failAudit = false; let role = "MANAGER"; let access = "ta";
  const audits: any[] = []; const unitUpdates: any[] = [];
  stub(prisma.property, "findUnique", async () => ({ id: "ta", code: "DG", name: "Demo Gardens", isActive: true }));
  stub(prisma.boardSection, "findMany", async () => [{ key: "ready", sectionType: "READY" }, { key: "archive", sectionType: "ARCHIVE" }]);
  stub(prisma.makeReadyItem, "findMany", async ({ where }: any) => where.unitNumber || item.isArchived ? [] : [item]);
  stub(prisma.makeReadyItem, "update", async ({ data }: any) => { item = { ...item, ...data }; return item; });
  stub(prisma.floorPlan, "findMany", async () => []);
  stub(prisma.unit, "findUnique", async () => ({ id: "listed-unit" }));
  stub(prisma.unit, "update", async (args: any) => { unitUpdates.push(args); return { id: args.where.id }; });
  stub(prisma.workAssignmentBlock, "updateMany", async () => ({ count: 0 }));
  stub(prisma.auditLog, "create", async ({ data }: any) => { if (failAudit) throw new Error("Audit unavailable"); audits.push(data); return data; });
  stub(prisma, "$queryRaw", async () => []);
  stub(prisma, "$transaction", async (fn: any) => {
    const before = { ...item }; const count = unitUpdates.length;
    try { return await fn(prisma); } catch (error) { item = before; unitUpdates.splice(count); throw error; }
  });
  const app = Fastify(); app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "actor", role, propertyAccess: [{ propertyId: access }] } as any; });
  await app.register(operationsRoutes); t.after(() => app.close());
  const input = { propertyId: "ta", rows: [{ number: "100", vacancyStatus: "VACANT_READY" }], createTurns: false, reportDate: "2026-09-13" };
  const submit = (extra: object) => app.inject({ method: "POST", url: "/operations/availability/import", payload: { ...input, ...extra } });
  const partial = await submit({});
  assert.equal(partial.statusCode, 200, partial.body);
  assert.equal(item.isArchived, false);
  const updatesBeforeFailedReceipt = unitUpdates.length;
  failAudit = true;
  assert.equal((await submit({})).statusCode, 500);
  assert.equal(unitUpdates.length, updatesBeforeFailedReceipt, "Failed import receipt must roll back listed-unit updates too");
  failAudit = false;
  const preview = await submit({ fullReport: true, previewOnly: true });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().candidates[0].unitNumber, "011");
  assert.equal(item.isArchived, false);
  assert.equal((await submit({ fullReport: true, archivePreviewToken: "stale" })).statusCode, 409);
  const token = preview.json().token;
  role = "TECH"; assert.equal((await submit({ fullReport: true, archivePreviewToken: token })).statusCode, 403);
  role = "MANAGER"; access = "vab"; assert.equal((await submit({ fullReport: true, archivePreviewToken: token })).statusCode, 403); access = "ta";
  failAudit = true;
  assert.equal((await submit({ fullReport: true, archivePreviewToken: token })).statusCode, 500);
  assert.equal(item.isArchived, false);
  failAudit = false;
  const result = await submit({ fullReport: true, archivePreviewToken: token });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().summary.turnsArchived, 1);
  assert.equal(item.vacancyStatus, "OCCUPIED"); assert.equal(item.boardGroup, "archive"); assert.equal(item.isArchived, true);
  assert.equal(item.completionStatus, "YES");
  assert.ok(unitUpdates.some(update => update.where.id === "unit" && update.data.occupancyStatus === "OCCUPIED"));
  assert.ok(unitUpdates.some(update => update.where.id === "unit" && update.data.currentResidentName === "Incoming Demo"));
  assert.ok(unitUpdates.some(update => update.where.id === "unit" && update.data.currentResidentMoveInDate?.toISOString() === "2026-09-10T00:00:00.000Z"));
  assert.equal(item.outgoingResidentName, "Outgoing Demo");
  assert.ok(audits.some(audit => audit.action === "AVAILABILITY_MOVED_IN_ARCHIVED" && audit.actorUserId === "actor"));
  const receipts = audits.filter(audit => audit.action === "AVAILABILITY_IMPORTED");
  assert.equal(receipts[0].metadata.fullReport, false);
  assert.equal(receipts.at(-1).metadata.fullReport, true);
  assert.equal(receipts.at(-1).metadata.reportDate, "2026-09-13");
  assert.equal(receipts.at(-1).metadata.receiptVersion, 1);

  stub(prisma.makeReadyItem, "findFirst", async () => null);
  stub(prisma.boardSection, "findFirst", async () => ({ key: "ready" }));
  stub(prisma.makeReadyItem, "create", async ({ data }: any) => ({ ...data, id: "new-turn" }));
  stub(prisma.makeReadyItem, "findUnique", async () => { throw new Error("Risk refresh unavailable"); });
  const savedWithWarning = await submit({ createTurns: true });
  assert.equal(savedWithWarning.statusCode, 200, savedWithWarning.body);
  assert.equal(savedWithWarning.json().applied, true);
  assert.deepEqual(savedWithWarning.json().createdItemIds, ["new-turn"]);
  assert.match(savedWithWarning.json().warnings[0], /Import saved.*Do not repeat/);
  assert.equal(audits.filter(audit => audit.action === "AVAILABILITY_IMPORTED").length, receipts.length + 1);
});
