import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveOccupiedTurn } from "./archiveOccupiedTurn.js";

test("ready-to-occupied archives in the same property and synchronizes the unit directory", async () => {
  const current = { id: "turn", propertyId: "ta", unitId: "unit", unitNumber: "163", vacancyStatus: "VACANT LEASED READY", completionStatus: "YES", makeReadyStatus: "DONE", isArchived: false } as any;
  let writes = 0;
  const db = {
    boardSection: { findFirst: async ({ where }: any) => { assert.equal(where.propertyId, "ta"); assert.equal(where.sectionType, "ARCHIVE"); return { key: "DG_ARCHIVE" }; } },
    unit: { updateMany: async ({ where, data }: any) => { assert.deepEqual(where, { id: "unit", propertyId: "ta" }); assert.equal(data.occupancyStatus, "OCCUPIED"); writes++; } },
    auditLog: { create: async () => { writes++; } },
  };
  const patch: Record<string, unknown> = { vacancyStatus: "OCCUPIED" };
  await archiveOccupiedTurn(db as any, current, patch);
  assert.equal(patch.boardGroup, "DG_ARCHIVE");
  assert.equal(patch.isArchived, true);
  assert.ok(patch.archivedAt instanceof Date);
  assert.equal(writes, 2);
  for (const item of [{ ...current, isArchived: true }, { ...current, makeReadyStatus: "FINAL WALK" }, { ...current, vacancyStatus: "VACANT NOT LEASED NOT READY", completionStatus: "NO" }]) {
    const unchanged = { vacancyStatus: "OCCUPIED" };
    await archiveOccupiedTurn(db as any, item, unchanged);
    assert.deepEqual(unchanged, { vacancyStatus: "OCCUPIED" });
  }
  assert.equal(writes, 2);
  db.boardSection.findFirst = async () => null as any;
  await assert.rejects(archiveOccupiedTurn(db as any, current, { vacancyStatus: "OCCUPIED" }), /Configure an Archive section/);
});

test("board list archive-only filters both rows and pagination counts", async t => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "archive-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("./prisma.js");
  const { makeReadyRoutes } = await import("../routes/makeReady.js");
  const { default: Fastify } = await import("fastify");
  const originalFind = prisma.makeReadyItem.findMany;
  const originalCount = prisma.makeReadyItem.count;
  const queries: any[] = [];
  prisma.makeReadyItem.findMany = (async ({ where }: any) => { queries.push(where); return []; }) as any;
  prisma.makeReadyItem.count = (async ({ where }: any) => { queries.push(where); return 0; }) as any;
  t.after(() => { prisma.makeReadyItem.findMany = originalFind; prisma.makeReadyItem.count = originalCount; });
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async req => { req.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(makeReadyRoutes);
  t.after(() => app.close());
  for (const [mode, expected] of [["archived", true], ["active", false], ["all", undefined]] as const) {
    queries.length = 0;
    const response = await app.inject(`/make-ready-items?propertyId=ta&archiveState=${mode}&includeArchived=true&limit=1`);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(queries.length, 2);
    for (const where of queries) { assert.equal(where.isArchived, expected); assert.equal(where.propertyId, "ta"); }
  }
});
