import assert from "node:assert/strict";
import { test } from "node:test";

test("audit IP attribution honors proxy trust and handles background events", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "audit-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("./prisma.js");
  const { authConfig } = await import("./config.js");
  const mutableConfig = authConfig as { trustProxy: boolean };
  const { writeAuditLog } = await import("./audit.js");
  const originalCreate = prisma.auditLog.create;
  const originalTrust = authConfig.trustProxy;
  let saved: any;
  prisma.auditLog.create = (async ({ data }: any) => { saved = data; return data; }) as any;
  t.after(() => { prisma.auditLog.create = originalCreate; mutableConfig.trustProxy = originalTrust; });
  const request = { ip: "192.0.2.1", headers: { "x-forwarded-for": "198.51.100.1, 192.0.2.2" } } as any;
  const event = { entityType: "AUTH", action: "AUTH_LOGIN_FAILED", message: "Test event" };
  mutableConfig.trustProxy = false;
  await writeAuditLog({ ...event, request });
  assert.equal(saved.ipAddress, "192.0.2.1");
  mutableConfig.trustProxy = true;
  await writeAuditLog({ ...event, request });
  assert.equal(saved.ipAddress, "198.51.100.1");
  await writeAuditLog(event);
  assert.equal(saved.ipAddress, null);
});
