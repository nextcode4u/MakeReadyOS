import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { patchSchema } from "./patchSchema.js";
import { schemaToOpenApi } from "./schemaToOpenApi.js";
import { assertValidationBudget, validationBudget } from "./validationBudget.js";

test("partial updates omit create defaults but preserve supplied false, null and empty values", () => {
  const create = z.object({
    name: z.string().default("New"),
    enabled: z.boolean().default(true),
    notes: z.string().nullable().default(null),
    tags: z.array(z.string()).default([]),
    nested: z.object({ active: z.boolean().default(true) }).prefault({}),
  }).strict();
  const patch = patchSchema(create);
  assert.deepEqual(patch.parse({}), {});
  assert.deepEqual(patch.parse({ name: "Changed" }), { name: "Changed" });
  assert.deepEqual(patch.parse({ enabled: false, notes: null, tags: [] }), { enabled: false, notes: null, tags: [] });
  assert.deepEqual(patch.parse({ nested: {} }), { nested: { active: true } });
  assert.equal(patch.safeParse({ extra: true }).success, false);
  assert.equal(patch.safeParse({ enabled: "false" }).success, false);
  assert.deepEqual(create.parse({}), { name: "New", enabled: true, notes: null, tags: [], nested: { active: true } });
  assert.deepEqual(patch.extend({ revision: z.number() }).parse({ revision: 1 }), { revision: 1 });
});

test("CVE-2023-54404: bounded arrays reject before validating elements", () => {
  let visited = 0;
  const schema = z.array(z.string().superRefine(() => { visited++; })).max(2);
  const result = schema.safeParse(["a", "b", "c"]);
  assert.equal(result.success, false);
  assert.equal(visited, 0);
  if (!result.success) {
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
  }
});

test("validation budget rejects oversized collections and excessive depth before schema parsing", () => {
  assert.doesNotThrow(() => assertValidationBudget({ rows: Array.from({ length: 1500 }, (_, i) => ({ unit: String(i), occupied: true })) }));
  assert.throws(() => assertValidationBudget(new Array(validationBudget.collectionSize + 1).fill(null)), { statusCode: 400 });
  let nested: unknown = null;
  for (let i = 0; i <= validationBudget.depth; i++) nested = { value: nested };
  assert.throws(() => assertValidationBudget(nested), { statusCode: 400 });
  assert.throws(() => assertValidationBudget(Array.from({ length: 25 }, () => Array(10000).fill(null))), { statusCode: 400 });
});

test("native OpenAPI exporter describes optional patch fields and input transforms", () => {
  const schema = patchSchema(z.object({ enabled: z.boolean().default(true), name: z.string().transform(value => value.trim()) }));
  const json = schemaToOpenApi(schema);
  assert.equal(json.required, undefined);
  const enabled = json.properties?.enabled;
  const name = json.properties?.name;
  assert.ok(enabled && typeof enabled === "object");
  assert.ok(name && typeof name === "object");
  assert.equal(enabled.type, "boolean");
  assert.equal(name.type, "string");
  assert.deepEqual(schemaToOpenApi(z.coerce.date()), { type: "string", format: "date-time" });
});

test("saved view edits preserve sharing and filters; property template defaults are still populated", async () => {
  process.env.ADMIN_USERNAME = "validation-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { savedViewUpdateSchema } = await import("../routes/savedViews.js");
  const { propertyTemplateCreateFromPropertySchema, propertyTemplateIncludeSchema } = await import("../routes/propertyTemplates.js");
  assert.deepEqual(savedViewUpdateSchema.parse({ name: "Renamed" }), { name: "Renamed" });
  const template = propertyTemplateCreateFromPropertySchema.parse({ propertyId: "synthetic", name: "Test template" });
  assert.deepEqual(template.include, propertyTemplateIncludeSchema.parse({}));
  assert.equal(template.include.boardSections, true);
  assert.equal(template.include.floorPlans, false);
});

test("HTTP validation budget rejects excessive work before reaching a handler", async t => {
  const { default: Fastify } = await import("fastify");
  const app = Fastify();
  t.after(() => app.close());
  let called = false;
  app.addHook("preValidation", async request => assertValidationBudget(request.body));
  app.post("/test", async () => { called = true; return { ok: true }; });
  const rejected = await app.inject({ method: "POST", url: "/test", payload: Array(10001).fill(null) });
  assert.equal(rejected.statusCode, 400);
  assert.equal(called, false);
  assert.match(rejected.json().message, /too many entries/);
  const accepted = await app.inject({ method: "POST", url: "/test", payload: { rows: [] } });
  assert.equal(accepted.statusCode, 200);
  assert.equal(called, true);
});
