import assert from "node:assert/strict";
import { test } from "node:test";

test("branding rejects remote, scriptable and oversized logos", async () => {
  process.env.ADMIN_USERNAME = "branding-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  const { brandingLogoSchema } = await import("./propertyBranding.js");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  assert.equal(brandingLogoSchema.safeParse(`data:image/png;base64,${png.toString("base64")}`).success, true);
  assert.equal(brandingLogoSchema.safeParse(null).success, true);
  for (const value of ["https://example.test/logo.png", "data:image/svg+xml,<svg onload='alert(1)'/>", "data:image/png;base64,AAAA", "x".repeat(200001)]) assert.equal(brandingLogoSchema.safeParse(value).success, false);
  png.writeUInt32BE(100000, 16);
  assert.equal(brandingLogoSchema.safeParse(`data:image/png;base64,${png.toString("base64")}`).success, false);
});

test("branding writes require admin and reads require property access", async () => {
  const { default: Fastify } = await import("fastify");
  const { propertyBrandingRoutes } = await import("./propertyBranding.js");
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "staff", role: "MANAGER", propertyAccess: [{ propertyId: "allowed" }] } as any; });
  await app.register(propertyBrandingRoutes);
  try {
    for (const [method, url] of [["POST", "/management-companies"], ["PATCH", "/management-companies/company"], ["PUT", "/property-branding/allowed"], ["GET", "/property-branding/outside"]] as const) {
      const response = await app.inject({ method, url });
      assert.equal(response.statusCode, 403, response.body);
    }
  } finally { await app.close(); }
});
