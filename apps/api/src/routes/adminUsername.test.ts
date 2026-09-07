import assert from "node:assert/strict";
import { test } from "node:test";

test("account creation accepts email usernames and rejects conflicting login identifiers", async (t) => {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
  process.env.ADMIN_USERNAME = "username-test";
  process.env.ADMIN_PASSWORD = "Test-Only-Password!123";
  process.env.SESSION_COOKIE_SECRET = "test-only-session-secret-12345678901234567890";
  process.env.APP_URL = "http://localhost:8080";
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_FROM = "invites@example.com";
  const { default: nodemailer } = await import("nodemailer");
  const messages: any[] = [];
  let mailFails = false;
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (message: any) => {
    if (mailFails) throw new Error("Test SMTP unavailable");
    messages.push(message);
  } }));
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
  let role = "ADMIN";
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async request => { request.currentUser = { id: "admin", role, propertyAccess: [] } as any; });
  await app.register(adminRoutes);
  t.after(() => app.close());
  let setupUsers: any[] = [{ id: "bootstrap", username: "username-test", email: null, isActive: true, role: "ADMIN", propertyAccess: [] }];
  stub(prisma.user, "findMany", async () => setupUsers);
  const staffSetup = async () => {
    const response = await app.inject({ method: "GET", url: "/admin/users" });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().hasAdditionalActiveUser;
  };
  assert.equal(await staffSetup(), false, "default admin alone is not staff setup");
  for (const userRole of ["ADMIN", "MANAGER", "TECH", "CLEANER", "LEASING", "VIEWER"]) {
    setupUsers = [setupUsers[0], { id: "staff", username: "staff", email: null, isActive: true, role: userRole, propertyAccess: [] }];
    assert.equal(await staffSetup(), true, `one active ${userRole} counts without property assignments`);
  }
  setupUsers[1].isActive = false;
  assert.equal(await staffSetup(), false, "inactive additional accounts do not count");
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
  let recent = 0;
  stub(prisma.auditLog, "count", async () => recent);
  stub(prisma.property, "findMany", async () => []);
  stub(prisma.user, "update", async ({ where, data }: any) => Object.assign(users.find(user => user.id === where.id), data));
  const resend = () => app.inject({ method: "POST", url: "/admin/users/new/resend-invite" });
  assert.equal((await resend()).statusCode, 400, "missing email must block resend");
  users[0].email = "recipient@example.com";
  users[0].isActive = false;
  assert.equal((await resend()).statusCode, 400, "inactive users cannot receive invites");
  users[0].isActive = true;
  const oldPassword = users[0].passwordHash;
  assert.equal((await resend()).statusCode, 200);
  const firstHash = users[0].passwordResetHash;
  assert.ok(firstHash);
  assert.ok(users[0].passwordResetExpiresAt.getTime() > Date.now() + 59 * 60_000);
  assert.equal(messages[0].to, "recipient@example.com");
  assert.equal(users[0].passwordHash, oldPassword, "sending must not change the current password");
  recent = 1;
  assert.equal((await resend()).statusCode, 429);
  recent = 0;
  assert.equal((await resend()).statusCode, 200);
  assert.notEqual(users[0].passwordResetHash, firstHash, "resending replaces the old link");
  const beforeRejected = messages.length;
  const latestHash = users[0].passwordResetHash;
  for (role of ["MANAGER", "TECH", "VIEWER"]) {
    assert.equal((await resend()).statusCode, 403);
  }
  assert.equal(messages.length, beforeRejected, "unauthorized requests must not send email");
  assert.equal(users[0].passwordResetHash, latestHash, "unauthorized requests must not replace links");
  role = "ADMIN";
  assert.equal((await app.inject({ method: "POST", url: "/admin/users/missing/resend-invite" })).statusCode, 404);
  mailFails = true;
  assert.equal((await resend()).statusCode, 502);
  assert.equal(users[0].passwordHash, oldPassword, "delivery failure must preserve the current password");
  assert.equal(messages.length, beforeRejected);
});
