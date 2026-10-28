import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { prisma } from "../lib/prisma.js";
import { androidPushRoutes, androidSessionKey } from "./androidPush.js";
import { createRelay, enrollTenant, openRelayDatabase } from "../relay/service.js";
import { androidConfiguration, relayConfiguration, sendAndroid } from "../lib/pushRelayClient.js";

test("authenticated API completes relay proof, stores only a handle, sends and disables", async t => {
  const directory = mkdtempSync(join(tmpdir(), "mros-relay-test-"));
  const db = openRelayDatabase(":memory:");
  const tenant = enrollTenant(db, "https://example.test");
  const credentialFile = join(directory, "credential");
  writeFileSync(credentialFile, tenant.credential, { mode: 0o600 });
  const env = { ANDROID_PUSH_TRANSPORT: "relay", APP_URL: "https://example.test", PUSH_RELAY_URL: "", PUSH_RELAY_CREDENTIAL_FILE: credentialFile, FCM_PROJECT_ID: "test-project" };
  const original = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const messages: Array<Record<string, string>> = [];
  const relay = createRelay(db, "test-project", async (_token, data) => { messages.push(data); });
  const app = Fastify();
  const restore: Array<() => void> = [];
  function stub(object: any, key: string, value: any) { const old = object[key]; object[key] = value; restore.push(() => { object[key] = old; }); }
  t.after(async () => {
    restore.reverse().forEach(fn => fn());
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await app.close(); await relay.close(); db.close(); rmSync(directory, { recursive: true });
  });
  stub(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(new URL(url).origin, "https://push.example.test");
    assert.equal(options.redirect, "error");
    const reply = await relay.inject({ method: "POST", url: new URL(url).pathname, headers: options.headers as Record<string, string>, payload: options.body as string });
    return new Response(reply.body, { status: reply.statusCode, headers: { "Content-Type": "application/json" } });
  });
  let authenticated = true;
  app.addHook("preHandler", async request => {
    if (authenticated) { request.authType = "session"; request.sessionId = "session-a"; request.currentUser = { id: "user-a" } as any; }
  });
  let saved: any;
  const session = { id: "session-a", userId: "user-a", expiresAt: new Date(Date.now() + 600000) };
  const subscriptions = {
    findUnique: async () => saved ? { ...saved, session } : null,
    findMany: async () => saved ? [saved] : [],
    count: async () => 0,
    deleteMany: async () => { saved = undefined; return { count: 1 }; },
    upsert: async (input: any) => { saved = input.create; return saved; },
  };
  stub(prisma.session, "findUnique", async () => session);
  for (const [key, value] of Object.entries(subscriptions)) stub(prisma.pushSubscription, key, value);
  stub(prisma, "$transaction", async (fn: any) => fn({ $executeRaw: async () => 1, session: prisma.session, pushSubscription: subscriptions }));
  await androidPushRoutes(app);
  const input = { token: "synthetic-device-token-123", bindingId: "d673a280-1ae9-4f6d-8455-464921bc3431", projectId: "test-project", sessionKey: androidSessionKey(session.id) };
  const begin = { ...input, nonce: "d673a280-1ae9-4f6d-8455-464921bc3432" };
  const post = (url: string, payload: object) => app.inject({ method: "POST", url, payload });
  authenticated = false;
  assert.equal((await post("/push/android/challenge", begin)).statusCode, 403);
  authenticated = true;
  assert.equal((await post("/push/android", input)).statusCode, 409);
  assert.equal((await post("/push/android/challenge", { ...begin, sessionKey: "0".repeat(64) })).statusCode, 409);
  const challenge = await post("/push/android/challenge", begin);
  assert.equal(challenge.statusCode, 200, challenge.body);
  const registered = await post("/push/android", { ...input, challengeId: challenge.json().challengeId, proof: messages[0].proof });
  assert.equal(registered.statusCode, 200, registered.body);
  assert.equal(saved.transport, "ANDROID_RELAY"); assert.notEqual(saved.fcmToken, input.token);
  assert.match(saved.fcmToken, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(saved).includes(input.token));
  await sendAndroid(saved, "notice_123", Date.now() + 300000);
  assert.equal(messages[1].notificationId, "notice_123");
  const removed = await app.inject({ method: "DELETE", url: "/push/android", payload: { bindingId: input.bindingId } });
  assert.equal(removed.statusCode, 200);
  assert.equal((db.prepare("SELECT count(*) AS n FROM devices").get() as { n: number }).n, 0);
  process.env.PUSH_RELAY_URL = "http://push.example.test"; assert.equal(relayConfiguration(), null); assert.equal(androidConfiguration(), null);
  process.env.ANDROID_PUSH_TRANSPORT = "typo"; assert.equal(androidConfiguration(), null);
});
