import assert from "node:assert/strict";
import test from "node:test";
import { leaseDateSchema, validateMergedLeaseDates } from "../lib/leaseDates.js";

test("lease calendar validation handles leap days and retained bounds", () => {
  for (const date of ["2024-02-29", "2000-02-29", "2026-11-02"]) assert.equal(leaseDateSchema.safeParse(date).success, true);
  for (const date of ["2025-02-29", "1900-02-29", "2024-02-30", "2026-04-31", "2026-13-01", "2026-1-01", "2026-01-01T00:00:00Z", ""]) assert.equal(leaseDateSchema.safeParse(date).success, false, date);
  const start = new Date("2024-02-29");
  assert.throws(() => validateMergedLeaseDates({ currentResidentLeaseStartDate: start }, { currentResidentLeaseEndDate: new Date("2024-02-28") }));
  assert.doesNotThrow(() => validateMergedLeaseDates({ currentResidentLeaseStartDate: start }, { currentResidentLeaseStartDate: null, currentResidentLeaseEndDate: new Date("2024-02-28") }));
});

test("renewal is linked, scoped, locked, atomic and preserves unfinished repairs and the resident", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "renew-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { makeReadyRoutes } = await import("./makeReady.js");
  const { unitCreateSchema, unitPatchSchema, unitImportRowSchema, availabilityImportRowSchema } = await import("./operations.js");
  for (const schema of [unitCreateSchema, unitPatchSchema, unitImportRowSchema, availabilityImportRowSchema]) {
    const base = { propertyId: "p", number: "101" };
    assert.equal(schema.safeParse({ ...base, currentResidentLeaseStartDate: "2024-02-29", currentResidentLeaseEndDate: "2025-02-28" }).success, true);
    assert.equal(schema.safeParse({ ...base, currentResidentLeaseEndDate: "2025-02-29" }).success, false);
    assert.equal(schema.safeParse({ ...base, currentResidentLeaseStartDate: "2025-03-01", currentResidentLeaseEndDate: "2025-02-28" }).success, false);
  }
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, key: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[key]; delegate[key] = fn; t.after(() => { delegate[key] = original; });
  };
  const initial = { id: "turn", propertyId: "p", unitId: "u", unitNumber: "101", isArchived: false,
    vacancyStatus: "NTV LEASED", makeReadyStatus: "IN_PROGRESS", completionStatus: "NO", paintStatus: "NOT STARTED",
    applicant: "Not the resident", moveInDate: new Date("2027-01-01") };
  let item: any = { ...initial };
  let unit: any = { id: "u", propertyId: "p", currentResidentName: "Resident", currentResidentMoveInDate: new Date("2023-01-01"),
    currentResidentLeaseStartDate: new Date("2024-02-29"), currentResidentLeaseEndDate: new Date("2025-02-28") };
  let role = "MANAGER", access = ["p"], active = true, archive = true, other = false, locked = false, failAudit = false;
  const audits: any[] = [], blocks: any[] = [];
  stub(prisma, "$queryRaw", async () => { locked = true; return []; });
  stub(prisma, "$transaction", async fn => {
    locked = false;
    const before = { item: { ...item }, unit: { ...unit }, audits: audits.length, blocks: blocks.length };
    try { return await fn(prisma); } catch (error) {
      item = before.item; unit = before.unit; audits.length = before.audits; blocks.length = before.blocks; throw error;
    }
  });
  stub(prisma.makeReadyItem, "findUnique", async () => item);
  stub(prisma.makeReadyItem, "findUniqueOrThrow", async () => { assert.ok(locked); return item; });
  stub(prisma.makeReadyItem, "findFirst", async () => other ? { id: "newer" } : null);
  stub(prisma.makeReadyItem, "update", async ({ data }) => { item = { ...item, ...data }; return { ...item, unit }; });
  stub(prisma.property, "findUnique", async () => ({ isActive: active }));
  stub(prisma.unit, "findUnique", async () => unit);
  stub(prisma.unit, "update", async ({ data }) => { assert.ok(locked); unit = { ...unit, ...data }; return unit; });
  stub(prisma.unit, "updateMany", async ({ data }) => { unit = { ...unit, ...data }; return { count: 1 }; });
  stub(prisma.boardSection, "findFirst", async () => archive ? { key: "ARCHIVE" } : null);
  stub(prisma.workAssignmentBlock, "updateMany", async args => { blocks.push(args); return { count: 1 }; });
  stub(prisma.auditLog, "create", async ({ data }) => { if (failAudit && data.action === "BOARD_ITEM_RENEWED") throw new Error("audit failed"); audits.push(data); return data; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "actor", role, propertyAccess: access.map(propertyId => ({ propertyId })) } as any; });
  await app.register(makeReadyRoutes);
  t.after(() => app.close());
  const submit = (payload: object = { leaseEndDate: "2026-02-28" }) => app.inject({ method: "POST", url: "/make-ready-items/turn/renew", payload });
  for (role of ["TECH", "LEASING", "CLEANER", "VIEWER"]) assert.equal((await submit()).statusCode, 403);
  role = "MANAGER"; access = []; assert.equal((await submit()).statusCode, 403); access = ["p"];
  for (const payload of [{}, { leaseEndDate: null }, { leaseEndDate: "2025-02-29" }, { leaseEndDate: "2026-02-28", leaseStartDate: null }, { leaseEndDate: "2026-02-28", leaseStartDate: "2026-03-01" }, { leaseEndDate: "2024-02-28" }, { leaseEndDate: "2025-02-27" }]) assert.equal((await submit(payload)).statusCode, 400);
  active = false; assert.equal((await submit()).statusCode, 409); active = true;
  item.isArchived = true; other = true; assert.equal((await submit()).statusCode, 409); item.isArchived = false;
  assert.equal((await submit()).statusCode, 409); other = false;
  item.unitId = null; assert.equal((await submit()).statusCode, 409); item.unitId = "u";
  unit.propertyId = "other"; assert.equal((await submit()).statusCode, 409); unit.propertyId = "p";
  archive = false; assert.equal((await submit()).statusCode, 409); archive = true;
  assert.equal(audits.length, 0);
  failAudit = true; assert.equal((await submit()).statusCode, 500); failAudit = false;
  assert.equal(item.isArchived, false); assert.equal(unit.currentResidentLeaseEndDate.toISOString(), "2025-02-28T00:00:00.000Z");
  for (role of ["MANAGER", "ADMIN"]) {
    item = { ...initial };
    const response = await submit();
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().id, "turn");
    assert.equal(response.json().unit.currentResidentLeaseEndDate, "2026-02-28T00:00:00.000Z");
    assert.equal(item.isArchived, true); assert.equal(item.vacancyStatus, "OCCUPIED");
    assert.equal(item.completionStatus, "NO"); assert.equal(item.paintStatus, "NOT STARTED");
    assert.equal(unit.currentResidentName, "Resident");
    assert.equal(unit.currentResidentMoveInDate.toISOString(), "2023-01-01T00:00:00.000Z");
    assert.equal(unit.currentResidentLeaseStartDate.toISOString(), "2024-02-29T00:00:00.000Z");
    assert.equal(blocks.at(-1).data.status, "CANCELED");
    assert.equal(audits.at(-1).actorUserId, "actor");
  }
  item = { ...initial };
  assert.equal((await submit({ leaseStartDate: "2026-02-28", leaseEndDate: "2028-02-29" })).statusCode, 200);
  assert.equal(unit.currentResidentLeaseStartDate.toISOString(), "2026-02-28T00:00:00.000Z");
});
