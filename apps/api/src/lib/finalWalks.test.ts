import assert from "node:assert/strict";
import { test } from "node:test";
process.env.ADMIN_USERNAME = "final-walk-test";
process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";

test("final walk handoff follows order, skips ineligible users and never wraps", async () => {
  const { nextInspector } = await import("./finalWalks.js");
  const queue = ["leasing", "backup", "manager"];
  assert.equal(nextInspector(queue, null, queue), "leasing");
  assert.equal(nextInspector(queue, "leasing", ["leasing", "manager"]), "manager");
  assert.equal(nextInspector(queue, "manager", queue), undefined);
  assert.equal(nextInspector(queue, "unknown", queue), undefined);
  assert.equal(nextInspector(queue, null, []), undefined);
});

test("initial inspection and handoff skip the repair assignee without reordering backups", async () => {
  const { independentInspectors, nextInspector } = await import("./finalWalks.js");
  const staff = [{ id: "tech", fullName: "Repair Tech" }, { id: "leasing", fullName: "Leasing" }, { id: "manager", fullName: "Manager" }];
  const eligible = independentInspectors(staff, " repair TECH ").map(user => user.id);
  assert.deepEqual(eligible, ["leasing", "manager"]);
  assert.equal(nextInspector(["tech", "leasing", "manager"], null, eligible), "leasing");
  assert.equal(nextInspector(["leasing", "tech", "manager"], "leasing", eligible), "manager");
  assert.deepEqual(independentInspectors(staff, null), staff);
  assert.deepEqual(independentInspectors(staff, " "), staff);
  assert.deepEqual(independentInspectors([staff[0]], "Repair Tech"), []);
});

test("final walk settings reject non-managers and out-of-scope managers", async t => {
  const { finalWalkRoutes } = await import("../routes/finalWalks.js");
  const { default: Fastify } = await import("fastify");
  const app = Fastify();
  let role = "TECH";
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "u", role, propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(finalWalkRoutes);
  t.after(() => app.close());
  for (const value of ["TECH", "LEASING", "VIEWER", "MANAGER"]) {
    role = value;
    for (const method of ["GET", "PUT"] as const) assert.equal((await app.inject({ method, url: "/automations/final-walk/outside" })).statusCode, 403);
  }
});
