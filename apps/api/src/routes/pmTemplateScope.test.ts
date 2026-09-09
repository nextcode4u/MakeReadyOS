import assert from "node:assert/strict";
import { test } from "node:test";

test("PM template edits cannot transfer generated work between properties", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "pm-scope-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { preventiveMaintenanceRoutes } = await import("./preventiveMaintenance.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  let actor: any;
  let token: any;
  let writes = 0;
  let assignedUserId: string | null = null;
  let staffActive = true;
  let writeData: any;
  stub(prisma.preventiveMaintenanceTemplate, "findUnique", async () => ({ id: "template", propertyId: "allowed", name: "Fixture", assignedRole: "TECH", assignedUserId }));
  stub(prisma.user, "findUnique", async ({ where }) => ({ id: where.id, fullName: "Assigned staff", role: where.id === "manager" ? "MANAGER" : "TECH", isActive: staffActive, propertyAccess: [{ propertyId: "allowed" }] }));
  stub(prisma.preventiveMaintenanceTemplate, "update", async ({ data }) => { writeData = data; writes++; throw new Error("TEST_STOP_BEFORE_WRITE"); });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = actor; request.apiToken = token; });
  await app.register(preventiveMaintenanceRoutes);
  t.after(() => app.close());
  const send = (payload: object) => app.inject({ method: "PATCH", url: "/pm/templates/template", payload });
  for (const role of ["MANAGER", "ADMIN"]) {
    await t.test(`${role} cannot move a template to another property`, async () => {
      actor = { id: "actor", role, propertyAccess: [{ propertyId: "allowed" }] }; token = undefined; writes = 0;
      const response = await send({ propertyId: "outside" });
      assert.equal(response.statusCode, 409, response.body); assert.equal(writes, 0);
    });
    await t.test(`${role} can keep the same property`, async () => {
      writes = 0;
      const response = await send({ propertyId: "allowed" });
      assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
    });
  }
  await t.test("manager without original-property access is denied", async () => {
    actor = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "outside" }] }; writes = 0;
    const response = await send({ name: "Edit" });
    assert.equal(response.statusCode, 403, response.body); assert.equal(writes, 0);
  });
  await t.test("admin token cannot exceed original-property scope", async () => {
    actor = { id: "admin", role: "ADMIN", propertyAccess: [] }; token = { propertyIds: ["outside"] }; writes = 0;
    const response = await send({ name: "Edit" });
    assert.equal(response.statusCode, 403, response.body); assert.equal(writes, 0);
  });
  actor = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "allowed" }] }; token = undefined; assignedUserId = "staff";
  await t.test("role-only changes cannot retain an incompatible assignee", async () => {
    writes = 0;
    const response = await send({ assignedRole: "MANAGER" });
    assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0);
  });
  await t.test("role changes may explicitly clear the assignee", async () => {
    writes = 0;
    const response = await send({ assignedRole: "MANAGER", assignedUserId: null });
    assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
    assert.equal(writeData.assignedUserId, null); assert.equal(writeData.assignedUserName, null);
  });
  await t.test("role changes may select a compatible replacement", async () => {
    writes = 0;
    const response = await send({ assignedRole: "MANAGER", assignedUserId: "manager" });
    assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
    assert.equal(writeData.assignedUserId, "manager");
  });
  await t.test("ordinary edits do not erase inactive assignment history", async () => {
    writes = 0; staffActive = false;
    const response = await send({ description: "History" });
    assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
    assert.equal(writeData.assignedUserId, undefined);
  });
});
