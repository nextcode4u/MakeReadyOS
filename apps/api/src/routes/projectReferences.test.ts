import assert from "node:assert/strict";
import { test } from "node:test";

test("project links stay in scope and clearing a link clears derived details", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "project-reference-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { projectRoutes } = await import("./projects.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  let existing: any;
  let linked: any;
  let captured: any;
  let writes = 0;
  const reset = () => {
    existing = { id: "record", propertyId: "allowed", categoryId: null, propertyMapId: null, status: "Planning" };
    linked = { id: "link", propertyId: "allowed", name: "Category", isActive: true, isArchived: false };
    captured = undefined; writes = 0;
  };
  stub(prisma.projectRecord, "findUnique", async () => existing);
  for (const delegate of [prisma.projectCategory, prisma.propertyMap, prisma.propertyWikiEntry, prisma.propertyWikiVendor, prisma.propertyWikiAsset]) {
    stub(delegate, "findUnique", async () => linked);
  }
  for (const [delegate, method] of [[prisma.projectRecord, "create"], [prisma.projectRecord, "update"], [prisma.projectWikiReference, "create"]] as const) {
    stub(delegate, method, async ({ data }) => { captured = data; writes++; throw new Error("TEST_STOP_BEFORE_WRITE"); });
  }
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(projectRoutes);
  t.after(() => app.close());
  const send = (method: "POST" | "PATCH", patch: object) => app.inject({ method, url: `/projects/records${method === "PATCH" ? "/record" : ""}`, payload: method === "POST" ? { propertyId: "allowed", recordType: "Project", title: "Fixture", status: "Planning", ...patch } : patch });
  for (const field of ["categoryId", "propertyMapId"] as const) {
    for (const method of ["POST", "PATCH"] as const) {
      for (const condition of ["missing", "foreign", "inactive"] as const) await t.test(`${method} rejects ${condition} ${field}`, async () => {
        reset();
        linked = condition === "missing" ? null : { ...linked, ...(condition === "foreign" ? { propertyId: "outside" } : { isActive: false }) };
        const response = await send(method, { [field]: "link" });
        assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0);
      });
      await t.test(`${method} accepts an active same-property ${field}`, async () => {
        reset();
        const response = await send(method, { [field]: "link" });
        assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
      });
    }
    await t.test(`unchanged inactive ${field} remains editable`, async () => {
      reset(); existing[field] = "link"; linked.isActive = false; linked.isArchived = true;
      const response = await send("PATCH", { title: "Edited historical record" });
      assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1);
    });
    await t.test(`unchanged foreign ${field} cannot remain silently linked`, async () => {
      reset(); existing[field] = "link"; linked.propertyId = "outside";
      const response = await send("PATCH", { title: "Edit" });
      assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0);
    });
  }
  await t.test("global category is eligible", async () => {
    reset(); linked.propertyId = null;
    const response = await send("POST", { categoryId: "link" });
    assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(captured.categoryName, "Category");
  });
  await t.test("clear category also clears its saved name", async () => {
    reset(); existing.categoryId = "link"; existing.categoryName = "Old name";
    await send("PATCH", { categoryId: null });
    assert.equal(writes, 1); assert.equal(captured.categoryName, null);
  });
  await t.test("clear map also clears its old pin", async () => {
    reset(); existing.propertyMapId = "link"; existing.pinX = 20; existing.pinY = 30;
    await send("PATCH", { propertyMapId: null });
    assert.equal(writes, 1); assert.equal(captured.pinX, null); assert.equal(captured.pinY, null);
  });
  await t.test("archived map is not newly selectable", async () => {
    reset(); linked.isArchived = true;
    const response = await send("POST", { propertyMapId: "link" });
    assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0);
  });
  for (const targetType of ["ENTRY", "VENDOR", "ASSET"]) for (const condition of ["missing", "foreign", "inactive", "valid"]) await t.test(`${condition} wiki ${targetType}`, async () => {
    reset();
    if (condition === "missing") linked = null;
    if (condition === "foreign") linked.propertyId = "outside";
    if (condition === "inactive") linked.isActive = false;
    const response = await app.inject({ method: "POST", url: "/projects/records/record/wiki-references", payload: { targetType, targetId: "link" } });
    if (condition === "valid") { assert.match(response.body, /TEST_STOP_BEFORE_WRITE/); assert.equal(writes, 1); }
    else { assert.equal(response.statusCode, 400, response.body); assert.equal(writes, 0); }
  });
});
