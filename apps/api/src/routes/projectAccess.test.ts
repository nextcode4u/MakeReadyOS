import assert from "node:assert/strict";
import { test } from "node:test";

test("project mutations enforce property scope and eligible assignments before writing", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "project-access-test";
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
  let actor: any = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "allowed" }] };
  let token: any = undefined;
  let writes = 0;
  let recordProperty = "outside";
  const record = () => ({ id: "record", propertyId: recordProperty, assignedUserId: null, assignedRole: "TECH", executionType: "In-House", status: "Planning" });
  stub(prisma.projectRecord, "findUnique", async () => record());
  stub(prisma.projectTask, "findUnique", async () => ({ id: "task", recordId: "record", propertyId: recordProperty }));
  stub(prisma.projectAttachment, "findUnique", async () => ({ id: "attachment", propertyId: recordProperty, record: record() }));
  stub(prisma.projectWikiReference, "findUnique", async () => ({ id: "reference", propertyId: recordProperty, record: record() }));
  for (const [delegate, methods] of [
    [prisma.projectRecord, ["create", "update"]], [prisma.projectTask, ["create", "update"]],
    [prisma.projectComment, ["create"]], [prisma.projectAttachment, ["update"]],
    [prisma.projectWikiReference, ["create", "delete"]],
  ] as const) for (const method of methods) stub(delegate, method, async () => { writes++; throw new Error("TEST_STOP_BEFORE_WRITE"); });
  let assignee: any = { id: "viewer", fullName: "Viewer", role: "VIEWER", isActive: true, propertyAccess: [{ propertyId: "allowed" }] };
  stub(prisma.user, "findUnique", async () => assignee);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = actor; request.apiToken = token; });
  await app.register(projectRoutes);
  t.after(() => app.close());
  const routes = [
    { method: "PATCH", url: "/projects/records/record", payload: { title: "Edit" } },
    { method: "POST", url: "/projects/records/record/convert", payload: {} },
    { method: "POST", url: "/projects/records/record/comments", payload: { body: "Comment" } },
    { method: "POST", url: "/projects/records/record/tasks", payload: { title: "Task" } },
    { method: "PATCH", url: "/projects/tasks/task", payload: { title: "Edit" } },
    { method: "POST", url: "/projects/records/record/attachments", payload: {} },
    { method: "PATCH", url: "/projects/attachments/attachment", payload: { caption: "Edit" } },
    { method: "POST", url: "/projects/records/record/wiki-references", payload: { targetType: "ENTRY", targetId: "entry" } },
    { method: "DELETE", url: "/projects/wiki-references/reference" },
  ] as const;
  for (const role of ["MANAGER", "TECH", "ADMIN"]) {
    for (const route of routes) await t.test(`${role} rejects out-of-scope ${route.method} ${route.url}`, async () => {
      actor = { id: "actor", role, propertyAccess: [{ propertyId: "allowed" }] };
      token = role === "ADMIN" ? { propertyIds: ["allowed"] } : undefined;
      writes = 0;
      const response = await app.inject(route);
      assert.equal(response.statusCode, 403, response.body);
      assert.equal(writes, 0);
    });
  }
  token = undefined; recordProperty = "allowed";
  actor = { id: "manager", role: "MANAGER", propertyAccess: [{ propertyId: "allowed" }] };
  await t.test("changing property requires a separate transfer workflow", async () => {
    writes = 0;
    const response = await app.inject({ method: "PATCH", url: "/projects/records/record", payload: { propertyId: "outside" } });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(writes, 0);
  });
  for (const role of ["MANAGER", "TECH", "ADMIN"]) await t.test(`${role} retains in-scope edit access`, async () => {
    actor = { id: "actor", role, propertyAccess: [{ propertyId: "allowed" }] };
    writes = 0;
    const response = await app.inject(routes[0]);
    assert.equal(response.statusCode, 500);
    assert.match(response.body, /TEST_STOP_BEFORE_WRITE/);
    assert.equal(writes, 1);
  });
  const assignments = [
    { method: "POST", url: "/projects/records", payload: { propertyId: "allowed", recordType: "Project", title: "Test", status: "Planning", assignedUserId: "viewer" } },
    { method: "PATCH", url: "/projects/records/record", payload: { assignedUserId: "viewer" } },
    { method: "POST", url: "/projects/records/record/tasks", payload: { title: "Test", assignedUserId: "viewer" } },
    { method: "PATCH", url: "/projects/tasks/task", payload: { assignedUserId: "viewer" } },
  ] as const;
  for (const route of assignments) await t.test(`viewer cannot receive ${route.method} ${route.url}`, async () => {
    writes = 0;
    const response = await app.inject(route);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(writes, 0);
  });
  for (const role of ["ADMIN", "MANAGER", "TECH", "LEASING", "CLEANER"]) await t.test(`${role} remains assignable within the property`, async () => {
    assignee = { ...assignee, role };
    writes = 0;
    const response = await app.inject(assignments[2]);
    assert.equal(response.statusCode, 500);
    assert.match(response.body, /TEST_STOP_BEFORE_WRITE/);
    assert.equal(writes, 1);
  });
});
