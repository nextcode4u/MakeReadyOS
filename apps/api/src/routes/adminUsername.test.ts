import assert from "node:assert/strict";
import { test } from "node:test";

test("account creation accepts email usernames and rejects conflicting login identifiers", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "username-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  const { prisma } = await import("../lib/prisma.js");
  const { adminRoutes, adminCreateUserSchema } = await import("./admin.js");
  const { loginSchema } = await import("./auth.js");
  const { default: Fastify } = await import("fastify");
  const input = { fullName: "Email User", username: "Email.User+leasing@Example.com", email: "Email.User+leasing@Example.com", role: "VIEWER", password: "Example-Only!23456" };
  assert.ok(adminCreateUserSchema.safeParse(input).success);
  for (const username of ["bad name", "bad@@example.com", "x".repeat(41)]) {
    assert.equal(adminCreateUserSchema.safeParse({ ...input, username }).success, false);
  }
  const longEmail = `${"a".repeat(60)}@${"b".repeat(60)}.example.com`;
  assert.ok(adminCreateUserSchema.safeParse({ ...input, username: longEmail }).success);
  assert.ok(loginSchema.safeParse({ identifier: longEmail, password: input.password }).success);
  const users: any[] = [];
  const stub = (delegate: any, name: string, fn: (...args: any[]) => unknown) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  stub(prisma.user, "findUnique", async ({ where }: any) => users.find(user => Object.entries(where).every(([key, value]) => user[key] === value)) ?? null);
  stub(prisma.user, "create", async ({ data }: any) => {
    const user = { ...data, id: "new", propertyAccess: [] }; users.push(user); return user;
  });
  stub(prisma.auditLog, "create", async () => ({}));
  const app = Fastify();
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role: "ADMIN", propertyAccess: [] } as any; });
  await app.register(adminRoutes);
  t.after(() => app.close());
  const created = await app.inject({ method: "POST", url: "/admin/users", payload: input });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().user.username, input.email.toLowerCase());
  assert.equal(created.json().user.email, input.email.toLowerCase());
  users.push({ id: "other", username: "existing", email: "reserved@example.com" });
  const conflict = await app.inject({ method: "POST", url: "/admin/users", payload: { ...input, username: "RESERVED@example.com", email: "new@example.com" } });
  assert.equal(conflict.statusCode, 409);
  users[0].email = null;
  const reversed = await app.inject({ method: "POST", url: "/admin/users", payload: { ...input, username: "another-user", email: input.email } });
  assert.equal(reversed.statusCode, 409);
  assert.equal(users.length, 2, "rejected requests must not create accounts");
});
