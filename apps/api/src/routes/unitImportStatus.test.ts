import assert from "node:assert/strict";
import test from "node:test";

test("directory imports preserve existing status while updating resident details and initializing new units", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "directory-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { operationsRoutes } = await import("./operations.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, key: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[key]; delegate[key] = fn;
    t.after(() => { delegate[key] = original; });
  };
  const statuses = ["NTV LEASED", "VACANT NOT LEASED READY", "OCCUPIED", "DOWN", "UNKNOWN"];
  const units = new Map<string, any>(statuses.map((occupancyStatus, index) => [String(index), { id: String(index), number: String(index), occupancyStatus }]));
  const writes: any[] = [];
  stub(prisma.property, "findUnique", async () => ({ id: "demo", code: "DEMO", name: "Demo property", isActive: true }));
  stub(prisma.floorPlan, "findMany", async () => []);
  stub(prisma.unit, "findUnique", async ({ where }) => units.get(where.id ?? where.propertyId_number.number) ?? null);
  stub(prisma.unit, "findUniqueOrThrow", async ({ where }) => units.get(where.id));
  stub(prisma.unit, "update", async ({ where, data }) => {
    writes.push(data);
    Object.assign(units.get(where.id), data);
    return units.get(where.id);
  });
  stub(prisma.unit, "create", async ({ data }) => {
    const unit = { id: data.number, ...data };
    units.set(data.number, unit);
    return unit;
  });
  stub(prisma.auditLog, "create", async () => ({}));
  stub(prisma, "$transaction", async fn => fn(prisma));
  stub(prisma, "$queryRaw", async () => []);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(operationsRoutes);
  t.after(() => app.close());
  const submit = (rows: object[], updateExisting = true) => app.inject({ method: "POST", url: "/operations/units/import", payload: { propertyId: "demo", units: rows, updateExisting } });
  const response = await submit([
    ...statuses.map((status, index) => ({ number: String(index), occupancyStatus: status === "OCCUPIED" ? "VACANT_READY" : "OCCUPIED", currentResidentName: "Resident Demo", currentResidentMoveInDate: "2024-03-15", building: "North" })),
    { number: "new", occupancyStatus: "NTV LEASED" },
    { number: "new-unknown" },
  ]);
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().summary.created, 2);
  statuses.forEach((status, index) => {
    const unit = units.get(String(index));
    assert.equal(unit.occupancyStatus, status);
    assert.equal(unit.currentResidentName, "Resident Demo");
    assert.equal(unit.currentResidentMoveInDate.toISOString(), "2024-03-15T00:00:00.000Z");
    assert.equal(unit.building, "North");
  });
  assert.ok(writes.every(data => !Object.hasOwn(data, "occupancyStatus")));
  assert.equal(units.get("new").occupancyStatus, "NTV LEASED");
  assert.equal(units.get("new-unknown").occupancyStatus, "UNKNOWN");
  const skipped = await submit([{ number: "0", occupancyStatus: "OCCUPIED", currentResidentName: "Do not replace" }], false);
  assert.equal(skipped.statusCode, 200, skipped.body);
  assert.equal(skipped.json().summary.skipped, 1);
  assert.equal(units.get("0").currentResidentName, "Resident Demo");
  const lease = { currentResidentLeaseStartDate: "2024-02-29", currentResidentLeaseEndDate: "2025-02-28" };
  assert.equal((await submit([{ number: "0", ...lease }, { number: "lease-new", ...lease }])).statusCode, 200);
  for (const number of ["0", "lease-new"]) {
    assert.equal(units.get(number).currentResidentLeaseStartDate.toISOString(), "2024-02-29T00:00:00.000Z");
    assert.equal(units.get(number).currentResidentLeaseEndDate.toISOString(), "2025-02-28T00:00:00.000Z");
  }
  assert.equal((await submit([{ number: "0", currentResidentLeaseStartDate: "", currentResidentLeaseEndDate: null }])).statusCode, 200);
  assert.equal(units.get("0").currentResidentLeaseEndDate.toISOString(), "2025-02-28T00:00:00.000Z");
  assert.equal((await submit([{ number: "0", currentResidentLeaseEndDate: "2024-02-28" }])).statusCode, 400);
  assert.equal((await submit([{ number: "0", currentResidentLeaseStartDate: "2025-03-01" }])).statusCode, 400);
  units.get("0").propertyId = "demo";
  const patch = (payload: object) => app.inject({ method: "PATCH", url: "/operations/units/0", payload });
  assert.equal((await patch({ currentResidentLeaseEndDate: "2024-02-28" })).statusCode, 400);
  assert.equal((await patch({ currentResidentLeaseStartDate: "2025-03-01" })).statusCode, 400);
  assert.equal((await patch({ currentResidentLeaseStartDate: null, currentResidentLeaseEndDate: "2024-02-28" })).statusCode, 200);
  assert.equal(units.get("0").currentResidentLeaseStartDate, null);
  assert.equal((await patch({ currentResidentLeaseEndDate: null })).statusCode, 200);
  assert.equal(units.get("0").currentResidentLeaseEndDate, null);
});
