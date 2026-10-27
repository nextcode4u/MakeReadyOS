import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../lib/prisma.js";
import { androidPushRoutes, androidSessionKey, androidEndpoint } from "./androidPush.js";

test("Android registration is session scoped, project matched, and cannot steal an active account's device", async t => {
  const app = Fastify();
  const restore: Array<() => void> = [];
  function stub(object: any, key: string, value: any) { const old = object[key]; object[key] = value; restore.push(() => { object[key] = old; }); }
  t.after(async () => { await app.close(); restore.reverse().forEach(fn => fn()); });
  let authorized = true, otherOwner = false;
  let saved: any, deleted: any;
  const expiresAt = new Date(Date.now() + 60000);
  app.addHook("preHandler", async request => {
    if (authorized) { request.authType = "session"; request.sessionId = "session-a"; request.currentUser = { id: "user-a" } as any; }
  });
  const db = {
    $executeRaw: async () => 1,
    session: { findUnique: async () => ({ id: "session-a", userId: "user-a", expiresAt }) },
    pushSubscription: {
      findUnique: async () => otherOwner ? { id: "other-device", session: { userId: "user-b", expiresAt } } : null,
      count: async () => 0,
      deleteMany: async (input: any) => { deleted = input; return { count: 1 }; },
      upsert: async (input: any) => { saved = input; return input.create; },
    },
  };
  stub(prisma, "$transaction", async (fn: any) => fn(db));
  stub(prisma.pushSubscription, "deleteMany", db.pushSubscription.deleteMany);
  await androidPushRoutes(app, () => ({ projectId: "test-project", credentialsFile: "not-used" }));
  const input = { token: "synthetic-device-token-123", bindingId: "d673a280-1ae9-4f6d-8455-464921bc3431", projectId: "test-project", sessionKey: androidSessionKey("session-a") };
  const post = (payload = input) => app.inject({ method: "POST", url: "/push/android", payload });
  authorized = false; assert.equal((await post()).statusCode, 403); authorized = true;
  assert.equal((await post({ ...input, sessionKey: androidSessionKey("session-b") })).statusCode, 409);
  assert.equal((await post({ ...input, projectId: "wrong-project" })).statusCode, 409);
  otherOwner = true; assert.equal((await post()).statusCode, 409); assert.equal(Boolean(saved), false);
  otherOwner = false; const response = await post(); assert.equal(response.statusCode, 200);
  assert.equal(saved.create.sessionId, "session-a"); assert.equal(saved.create.transport, "ANDROID");
  assert.equal(saved.where.endpoint, androidEndpoint(input.token)); assert.ok(!saved.where.endpoint.includes(input.token));
  assert.equal(response.json().expiresAt, expiresAt.getTime());
  assert.equal(deleted.where.sessionId, "session-a"); assert.equal(deleted.where.bindingId, input.bindingId);
  const removed = await app.inject({ method: "DELETE", url: "/push/android", payload: { bindingId: input.bindingId } });
  assert.equal(removed.statusCode, 200); assert.equal(deleted.where.sessionId, "session-a"); assert.equal(deleted.where.transport, "ANDROID");
});
