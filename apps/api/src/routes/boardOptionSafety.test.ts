import assert from "node:assert/strict";
import { test } from "node:test";

test("shared status labels preserve workflow keys and require organization-wide administration", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "label-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { default: Fastify } = await import("fastify");
  const { prisma } = await import("../lib/prisma.js");
  const { operationsRoutes } = await import("./operations.js");
  const { assertSharedOptionImportsAllowed } = await import("../lib/sharedOptionImports.js");
  let role = "ADMIN";
  let writes = 0;
  let turnWrites = 0;
  let peers: any[] = [];
  let option: any = { id: "label", fieldKey: "completionStatus", value: "YES", displayName: null, color: "#123456", textColor: "#ffffff", sortOrder: 0, isArchived: false };
  const stub = (target: any, key: string, value: any) => {
    const original = target[key];
    target[key] = value;
    t.after(() => { target[key] = original; });
  };
  stub(prisma.labelDefinition, "findUnique", async ({ where }: any) => where.id === option.id || where.fieldKey_value?.value === option.value ? option : null);
  stub(prisma.labelDefinition, "findMany", async () => [option, ...peers]);
  stub(prisma.labelDefinition, "findFirst", async () => null);
  stub(prisma.labelDefinition, "count", async () => 1);
  stub(prisma.labelDefinition, "create", async ({ data }: any) => { writes++; return { ...option, ...data }; });
  stub(prisma.labelDefinition, "update", async ({ data }: any) => { writes++; option = { ...option, ...data }; return option; });
  stub(prisma.makeReadyItem, "updateMany", async () => { turnWrites++; return { count: 3 }; });
  stub(prisma, "$queryRaw", async () => []);
  stub(prisma, "$transaction", async (work: any) => typeof work === "function" ? work(prisma) : Promise.all(work));
  stub(prisma.auditLog, "create", async () => ({ id: "audit" }));
  const app = Fastify();
  app.addHook("preHandler", async request => {
    request.currentUser = { id: "actor", role, fullName: "Fixture Actor", propertyAccess: [{ propertyId: "only-TA" }] } as any;
  });
  await app.register(operationsRoutes);
  t.after(() => app.close());

  await t.test("admin display edits never rewrite turn statuses", async () => {
    const response = await app.inject({ method: "PATCH", url: "/operations/options/label", payload: { displayName: "Inspected", color: "#654321" } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().option.value, "YES");
    assert.equal(response.json().option.displayName, "Inspected");
    assert.equal(response.json().option.color, "#654321");
    assert.equal(turnWrites, 0);
  });
  await t.test("legacy rename requests cannot mutate canonical workflow keys", async () => {
    const before = writes;
    const response = await app.inject({ method: "PATCH", url: "/operations/options/label", payload: { value: "INSPECTED" } });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(writes, before);
    assert.equal(turnWrites, 0);
  });
  await t.test("scoped managers can read shared choices but cannot change definitions", async () => {
    role = "MANAGER";
    const before = writes;
    assert.equal((await app.inject({ method: "GET", url: "/operations/options" })).statusCode, 200);
    for (const request of [
      { method: "POST", url: "/operations/options", payload: { fieldKey: "paintStatus", value: "New", color: "#123456" } },
      { method: "PATCH", url: "/operations/options/label", payload: { color: "#123456" } },
      { method: "PUT", url: "/operations/options/reorder", payload: { ids: ["label"] } },
      { method: "POST", url: "/operations/options/label/archive" },
      { method: "POST", url: "/operations/options/label/restore" },
    ]) {
      const response = await app.inject(request as any);
      assert.equal(response.statusCode, 403, `${request.method} ${request.url}: ${response.body}`);
    }
    assert.equal(writes, before);
    assert.equal(turnWrites, 0);
  });
  await t.test("display names cannot collide with another active or archived choice", async () => {
    role = "ADMIN";
    const before = writes;
    peers = [{ ...option, id: "other-label", value: "NO", displayName: "Not ready", isArchived: true }];
    const duplicateEdit = await app.inject({ method: "PATCH", url: "/operations/options/label", payload: { displayName: " NOT_READY " } });
    assert.equal(duplicateEdit.statusCode, 409, duplicateEdit.body);
    const duplicateCreate = await app.inject({ method: "POST", url: "/operations/options", payload: { fieldKey: "completionStatus", value: "OTHER", displayName: "Not ready", color: "#123456" } });
    assert.equal(duplicateCreate.statusCode, 409, duplicateCreate.body);
    assert.equal(writes, before);
    assert.equal(turnWrites, 0);
  });
  await t.test("imports cannot bypass shared-definition permissions", async () => {
    const before = writes;
    await assertSharedOptionImportsAllowed("MANAGER", [{ fieldKey: "completionStatus", value: "YES" }]);
    await assertSharedOptionImportsAllowed("MANAGER", []);
    await assert.rejects(assertSharedOptionImportsAllowed("MANAGER", [{ fieldKey: "paintStatus", value: "New status" }]), { statusCode: 403 });
    await assertSharedOptionImportsAllowed("ADMIN", [{ fieldKey: "paintStatus", value: "New status" }]);
    assert.equal(writes, before);
    assert.equal(turnWrites, 0);
  });
});
