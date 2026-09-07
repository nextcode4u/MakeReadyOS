import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

test("pool entry validation rejects invalid chemicals before saving and preserves valid weights", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "pool-entry-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { poolLogRoutes } = await import("./poolLog.js");
  const { default: Fastify } = await import("fastify");
  const stub = (delegate: any, method: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[method];
    delegate[method] = fn;
    t.after(() => { delegate[method] = original; });
  };
  const facility = { id: "pool", propertyId: "a", name: "Pool", type: "POOL" };
  stub(prisma.poolFacility, "findUnique", async () => facility);
  stub(prisma.poolChemical, "findMany", async () => [{ id: "granules", name: "Granules", category: "OTHER", unit: "POUNDS", allowedUnits: [] }]);
  stub(prisma.poolChemistryTarget, "findUnique", async () => null);
  stub(prisma.webhookEndpoint, "findMany", async () => []);
  stub(prisma.auditLog, "create", async () => ({}));
  stub(prisma.user, "findMany", async () => []);
  const saved: any[] = [];
  stub(prisma.poolLogEntry, "create", async ({ data }: any) => {
    saved.push(data);
    return { ...data, id: "entry", facility, property: { code: "QA" }, safetyChecks: data.safetyChecks.create, chemicalAdditions: data.chemicalAdditions.create };
  });
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ message: error.issues[0]?.message });
    }
    return reply.send(error);
  });
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => {
    request.currentUser = { id: "tech", role: "TECH", propertyAccess: [{ propertyId: "a" }] } as any;
  });
  await app.register(poolLogRoutes);
  t.after(() => app.close());
  const payload = { propertyId: "a", facilityId: "pool", logDate: "2026-09-06" };
  for (const addition of [
    { chemicalId: "other-property", chemicalName: "Invalid", unit: "POUNDS", amount: 1 },
    { chemicalId: "granules", chemicalName: "Granules", unit: "GALLONS", amount: 1 },
  ]) {
    const response = await app.inject({ method: "POST", url: "/pool/entries", payload: { ...payload, chemicalAdditions: [addition] } });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal(saved.length, 0);
  for (const [unit, amount] of [["POUNDS", 1.5], ["OUNCES", 24]] as const) {
    const response = await app.inject({ method: "POST", url: "/pool/entries", payload: { ...payload, chemicalAdditions: [{ chemicalId: "granules", chemicalName: "Wrong label", unit, amount }] } });
    assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(saved.at(-1).chemicalAdditions.create[0], { chemicalId: "granules", chemicalName: "Granules", unit: "OUNCES", amount: 24, notes: null });
    assert.equal(saved.at(-1).evaluationJson.status, "INCOMPLETE");
    assert.ok(saved.at(-1).safetyChecks.create.every((check: any) => check.value === "NOT_CHECKED"));
  }
  const safetyChecks = saved.at(-1).safetyChecks.create.map((check: any) => ({ ...check, value: "PASS" }));
  const complete = { ...payload, ph: 7.4, freeChlorine: 2, combinedChlorine: 0, totalAlkalinity: 100, cyanuricAcid: 40, calciumHardness: 250, safetyChecks };
  let response = await app.inject({ method: "POST", url: "/pool/entries", payload: complete });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.json().entry.evaluationJson.status, "OK");
  response = await app.inject({ method: "POST", url: "/pool/entries", payload: { ...complete, safetyChecks: safetyChecks.slice(0, 1) } });
  assert.equal(response.json().entry.evaluationJson.status, "INCOMPLETE", "omitted checks must not silently pass");
  response = await app.inject({ method: "POST", url: "/pool/entries", payload: { ...complete, safetyChecks: safetyChecks.map((check: any, index: number) => ({ ...check, value: index === 0 ? "FAIL" : "PASS" })) } });
  assert.equal(response.json().entry.evaluationJson.status, "REVIEW", "explicit safety failure must not show OK");
  const beforeDuplicates = saved.length;
  for (const duplicate of [safetyChecks[0].label, ` ${safetyChecks[0].label} `]) {
    response = await app.inject({ method: "POST", url: "/pool/entries", payload: {
      ...complete,
      safetyChecks: [{ ...safetyChecks[0], value: "FAIL" }, ...safetyChecks.slice(1), { ...safetyChecks[0], label: duplicate }],
    } });
    assert.equal(response.statusCode, 400, "duplicate labels must not erase a failed check");
  }
  assert.equal(saved.length, beforeDuplicates, "ambiguous checklists must not be saved");
});
