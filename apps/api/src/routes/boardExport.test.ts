import assert from "node:assert/strict";
import { test } from "node:test";
import { stringify } from "csv-stringify/sync";

test("board CSV retains built-in and same-label custom values", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "export-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("../lib/prisma.js");
  const { makeReadyRoutes } = await import("./makeReady.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  stub(prisma.makeReadyItem, "findMany", async () => [{
    property: { code: "TA" }, boardGroup: "ready", unitNumber: "101", notes: "Original notes",
    customFieldValues: [
      { customFieldId: "a", value: "Custom unit" },
      { customFieldId: "b", value: "First inspection" },
      { customFieldId: "c", value: "Second inspection" },
      { customFieldId: "d", value: "=unsafe" },
    ],
  }]);
  stub(prisma.customField, "findMany", async () => [
    { id: "a", label: "unitNumber" }, { id: "b", label: "Inspection" },
    { id: "c", label: "Inspection" }, { id: "d", label: "Unique" },
  ]);
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(makeReadyRoutes);
  t.after(() => app.close());
  const response = await app.inject("/export/make-ready.csv");
  assert.equal(response.statusCode, 200, response.body);
  const [header, row] = response.body.trimEnd().split("\n");
  const headers = header.split(",");
  assert.equal(new Set(headers).size, headers.length);
  assert.deepEqual(headers.slice(-4), ["unitNumber [custom:a]", "Inspection [custom:b]", "Inspection [custom:c]", "Unique"]);
  assert.equal(row.split(",")[headers.indexOf("unitNumber")], "101");
  assert.equal(row.split(",")[headers.indexOf("notes")], "Original notes");
  assert.ok(row.endsWith(stringify([["Custom unit", "First inspection", "Second inspection", "=unsafe"]], { escape_formulas: true }).trimEnd()));
});
