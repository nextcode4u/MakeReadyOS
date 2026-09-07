import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureBootstrapAdmin } from "./bootstrapAdmin.js";
import { verifyPassword } from "./password.js";

test("bootstrap preserves existing password, recovery email, role and active state", async () => {
  const existing = { id: "existing", username: "admin", email: "recovery@example.com", passwordHash: "saved hash", role: "MANAGER", isActive: false };
  const before = structuredClone(existing);
  const db = { user: {
    findFirst: async () => existing,
    create: async () => { throw new Error("Existing account must not be recreated"); },
    update: async () => { throw new Error("Existing account must not be overwritten"); },
  } };
  assert.equal(await ensureBootstrapAdmin(db as any, { username: "admin", email: null, password: "Different-Environment-Password!" }), "existing");
  assert.deepEqual(existing, before);
});

test("bootstrap still creates a working initial administrator", async () => {
  let created: any;
  const db = { user: { findFirst: async () => null, create: async ({ data }: any) => { created = data; return { id: "new" }; } } };
  assert.equal(await ensureBootstrapAdmin(db as any, { username: "first", email: null, password: "New-Admin-Password!123" }), "new");
  assert.equal(created.role, "ADMIN");
  assert.equal(created.username, "first");
  assert.equal(await verifyPassword("New-Admin-Password!123", created.passwordHash), true);
});
