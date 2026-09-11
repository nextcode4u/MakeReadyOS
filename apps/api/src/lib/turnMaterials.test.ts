import assert from "node:assert/strict";
import test from "node:test";
import { newlyRequestedMaterials, turnMaterialsSchema } from "./turnMaterials.js";

const row = { id: "00000000-0000-4000-8000-000000000001", name: "HVAC filter", quantity: 2, unit: "each", status: "NEEDED", notes: "20 x 20" };
test("order request alerts occur only when a line enters Need to order", () => {
  const needed = turnMaterialsSchema.parse([row]);
  const requested = turnMaterialsSchema.parse([{ ...row, status: "NEED_TO_ORDER" }]);
  assert.equal(newlyRequestedMaterials([], requested).length, 1);
  assert.equal(newlyRequestedMaterials(needed, requested).length, 1);
  assert.deepEqual(newlyRequestedMaterials(requested, [{ ...requested[0], quantity: 3, notes: "Supplier reference" }]), []);
  assert.deepEqual(newlyRequestedMaterials(requested, needed), []);
  const ordered = turnMaterialsSchema.parse([{ ...row, status: "ORDERED" }]);
  assert.deepEqual(newlyRequestedMaterials(requested, ordered), []);
  assert.equal(newlyRequestedMaterials(ordered, requested).length, 1);
});
test("materials validate meaningful quantities, bounded rows and unique IDs", () => {
  assert.equal(turnMaterialsSchema.parse([row])[0].quantity, 2);
  for (const quantity of [0, -1, Infinity, NaN, 100001]) assert.equal(turnMaterialsSchema.safeParse([{ ...row, quantity }]).success, false);
  assert.equal(turnMaterialsSchema.safeParse([{ ...row, name: " " }]).success, false);
  assert.equal(turnMaterialsSchema.safeParse([{ ...row, unit: "" }]).success, false);
  assert.equal(turnMaterialsSchema.safeParse([row, row]).success, false);
  assert.equal(turnMaterialsSchema.safeParse([{ ...row, status: "PASSED" }]).success, false);
});

test("materials routes enforce role, property and archive access", async t => {
  process.env.ADMIN_USERNAME = "materials-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { prisma } = await import("./prisma.js");
  const { turnMaterialRoutes } = await import("../routes/turnMaterials.js");
  const { default: Fastify } = await import("fastify");
  const original = prisma.makeReadyItem.findUnique;
  let archived = false; let active = true;
  prisma.makeReadyItem.findUnique = (async () => ({ id: "i", propertyId: "p", isArchived: archived, materials: [], materialsVersion: 0, property: { isActive: active } })) as any;
  t.after(() => { prisma.makeReadyItem.findUnique = original; });
  const app = Fastify(); let role = "TECH"; let properties = ["p"]; let token = false;
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "u", role, propertyAccess: properties.map(propertyId => ({ propertyId })) } as any; request.authType = token ? "apiToken" : "session"; });
  await app.register(turnMaterialRoutes); t.after(() => app.close());
  const put = () => app.inject({ method: "PUT", url: "/make-ready-items/i/materials", payload: { version: 0, rows: [row] } });
  for (const denied of ["LEASING", "VIEWER"]) { role = denied; assert.equal((await put()).statusCode, 403); }
  role = "TECH"; properties = ["other"];
  assert.equal((await put()).statusCode, 403);
  assert.equal((await app.inject("/make-ready-items/i/materials")).statusCode, 403);
  properties = ["p"]; archived = true; assert.equal((await put()).statusCode, 409);
  archived = false; active = false; assert.equal((await put()).statusCode, 409);
  active = true; token = true; assert.equal((await put()).statusCode, 403);
  token = false; assert.equal((await app.inject("/make-ready-items/i/materials")).statusCode, 200);
});
