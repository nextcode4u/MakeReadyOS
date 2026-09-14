import assert from "node:assert/strict";
import test from "node:test";

test("unit work plans are date-independent, property scoped and honest about bounded history", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "work-plan-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { planningRoutes } = await import("./planning.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  stub(prisma.makeReadyItem, "findUnique", async ({ where }: any) => where.id === "missing" ? null : { id: where.id, propertyId: where.id === "foreign" ? "b" : "a" });
  let reads = 0;
  for (const delegate of [prisma.workAssignmentBlock, prisma.vendorAssignment]) {
    stub(delegate, "findMany", async (args: any) => {
      reads++;
      assert.equal(args.where.itemId, "turn");
      assert.equal(args.where.propertyId, "a");
      assert.equal(args.where.plannedDate, undefined);
      assert.equal(args.where.scheduledDate, undefined);
      assert.equal(args.take, 200);
      if (args.include.assignedUser) assert.deepEqual(args.include.assignedUser.select, { id: true, fullName: true, role: true });
      return [{ id: "past", plannedDate: new Date("2020-01-01") }, { id: "future", plannedDate: new Date("2030-01-01") }];
    });
    stub(delegate, "count", async (args: any) => { reads++; assert.equal(args.where.propertyId, "a"); return 201; });
  }
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "a" }] } as any;
    request.authType = request.headers["x-test-token"] ? "apiToken" : "session";
  });
  await app.register(planningRoutes);
  t.after(() => app.close());
  for (const [id, status] of [["foreign", 403], ["missing", 404]] as const) assert.equal((await app.inject(`/planning/items/${id}`)).statusCode, status);
  assert.equal(reads, 0, "No child records are read before unit scope is checked");
  assert.equal((await app.inject({ url: "/planning/items/turn", headers: { "x-test-token": "yes" } })).statusCode, 403);
  assert.equal(reads, 0, "Dashboard token scopes must not grant access to vendor details");
  const response = await app.inject("/planning/items/turn");
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.json().blocks[0].plannedDate, "2020-01-01T00:00:00.000Z");
  assert.equal(response.json().blocks[1].plannedDate, "2030-01-01T00:00:00.000Z");
  assert.deepEqual(response.json().coverage, { blockTotal: 201, vendorTotal: 201, blocksTruncated: true, vendorsTruncated: true });
});
