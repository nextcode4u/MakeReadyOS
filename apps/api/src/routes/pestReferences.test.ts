import assert from "node:assert/strict";
import { test } from "node:test";

test("pest requests validate directory, vendor, staff and linked-turn scope before saving", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "pest-reference-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { pestControlRoutes } = await import("./pestControl.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  let existing: any;
  let unit: any;
  let vendor: any;
  let user: any;
  let item: any;
  let writes = 0;
  const reset = () => {
    existing = { id: "issue", propertyId: "allowed", unitId: null, vendorId: null, assignedUserId: null, makeReadyItemId: null, area: "Courtyard", status: "Open", followUpRequired: false };
    unit = { id: "unit", propertyId: "allowed", isActive: true };
    vendor = { id: "vendor", propertyId: "allowed", isActive: true };
    user = { id: "staff", role: "TECH", isActive: true, propertyAccess: [{ propertyId: "allowed" }] };
    item = { id: "turn", propertyId: "allowed", unitId: "unit", isArchived: false };
    writes = 0;
  };
  stub(prisma.unit, "findUnique", async () => unit);
  stub(prisma.pestVendor, "findUnique", async () => vendor);
  stub(prisma.user, "findUnique", async () => user);
  stub(prisma.makeReadyItem, "findUnique", async () => item);
  stub(prisma.makeReadyItem, "findFirst", async () => null);
  stub(prisma.pestIssue, "findUnique", async () => existing);
  for (const method of ["create", "update"]) stub(prisma.pestIssue, method, async () => { writes++; throw new Error("TEST_STOP_BEFORE_WRITE"); });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(pestControlRoutes);
  t.after(() => app.close());
  const send = (method: "POST" | "PATCH", payload: object) => app.inject({ method, url: `/pest/issues${method === "PATCH" ? "/issue" : ""}`, payload: method === "POST" ? { propertyId: "allowed", pestType: "Ants", area: "Courtyard", ...payload } : payload });
  for (const field of ["unitId", "vendorId", "assignedUserId"] as const) {
    for (const method of ["POST", "PATCH"] as const) for (const condition of ["missing", "foreign", "inactive", "valid"]) await t.test(`${method} ${condition} ${field}`, async () => {
      reset();
      let target = field === "unitId" ? unit : field === "vendorId" ? vendor : user;
      if (condition === "missing") target = null;
      if (condition === "foreign") target = { ...target, propertyId: "outside", propertyAccess: [{ propertyId: "outside" }] };
      if (condition === "inactive") target = { ...target, isActive: false };
      if (field === "unitId") unit = target;
      if (field === "vendorId") vendor = target;
      if (field === "assignedUserId") user = target;
      const response = await send(method, { [field]: field === "unitId" ? "unit" : field === "vendorId" ? "vendor" : "staff" });
      if (condition === "valid") { assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1); }
      else { assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0); }
    });
    await t.test(`unchanged inactive ${field} remains usable as history`, async () => {
      reset();
      existing[field] = field === "unitId" ? "unit" : field === "vendorId" ? "vendor" : "staff";
      unit.isActive = false; vendor.isActive = false; user.isActive = false;
      const response = await send("PATCH", { description: "Historical edit" });
      assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
    });
  }
  for (const method of ["POST", "PATCH"] as const) {
    await t.test(`${method} rejects a turn linked to a different unit`, async () => {
      reset(); item.unitId = "other-unit";
      const response = await send(method, { unitId: "unit", makeReadyItemId: "turn" });
      assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0);
    });
    await t.test(`${method} rejects a newly selected archived turn`, async () => {
      reset(); item.isArchived = true;
      const response = await send(method, { unitId: "unit", makeReadyItemId: "turn" });
      assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0);
    });
    for (const role of ["VIEWER", "CLEANER"]) await t.test(`${method} rejects a new ${role} assignee`, async () => {
      reset(); user.role = role;
      const response = await send(method, { assignedUserId: "staff" });
      assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0);
    });
  }
  await t.test("an unchanged archived turn stays linked to its original unit", async () => {
    reset(); existing.makeReadyItemId = "turn"; existing.unitId = "unit"; item.isArchived = true;
    const response = await send("PATCH", { description: "Historical edit" });
    assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
  });
  await t.test("property moves are rejected rather than silently ignored", async () => {
    reset();
    const response = await send("PATCH", { propertyId: "outside" });
    assert.equal(response.statusCode, 409, response.body); assert.equal(writes, 0);
  });
});
