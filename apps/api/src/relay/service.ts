import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const uuid = z.string().uuid();
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const registration = z.object({ token: z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:\-]+$/), bindingId: uuid,
  sessionKey: hex, expiresAt: z.number().int().positive(), projectId: z.string().max(100) });
type Tenant = { id: string; origin: string };
type Challenge = { id: string; tenant: string; token: string; binding: string; session: string; proof: string; expires: number; session_expires: number };
type Device = { handle: string; tenant: string; token: string; binding: string; expires: number };
export type RelaySender = (token: string, data: Record<string, string>, challenge: boolean) => Promise<void>;

export function openRelayDatabase(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY, origin TEXT NOT NULL UNIQUE, credential TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, tenant TEXT NOT NULL REFERENCES tenants(id), token TEXT NOT NULL, binding TEXT NOT NULL,
      session TEXT NOT NULL, proof TEXT NOT NULL, expires INTEGER NOT NULL, session_expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS devices(handle TEXT PRIMARY KEY, tenant TEXT NOT NULL REFERENCES tenants(id), token TEXT NOT NULL, binding TEXT NOT NULL, expires INTEGER NOT NULL, UNIQUE(tenant,token));
    CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS challenge_expiry ON challenges(expires);
    CREATE INDEX IF NOT EXISTS device_expiry ON devices(expires);`);
  return db;
}

export function enrollTenant(db: DatabaseSync, origin: string) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw new Error("Use a canonical HTTPS origin without a trailing slash");
  const credential = secret();
  const id = randomUUID();
  db.prepare("INSERT INTO tenants(id,origin,credential) VALUES(?,?,?)").run(id, origin, hash(credential));
  return { id, credential };
}

export function rotateTenant(db: DatabaseSync, id: string) {
  const credential = secret();
  if (!db.prepare("UPDATE tenants SET credential=? WHERE id=? AND enabled=1").run(hash(credential), id).changes) throw new Error("Active tenant not found");
  return credential;
}

export function createRelay(db: DatabaseSync, projectId: string, send: RelaySender, clock = Date.now) {
  const app = Fastify({ logger: false, bodyLimit: 8192, requestTimeout: 20000 });
  const error = (statusCode: number) => Object.assign(new Error("Push relay request rejected"), { statusCode });
  function limit(key: string, max: number, period: number) {
    const now = clock();
    const row = db.prepare(`INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN ? ELSE expires END RETURNING count`).get(key, now + period, now, now, now + period) as { count: number };
    if (row.count > max) throw error(429);
  }
  app.setErrorHandler((err, _request, reply) => { const code = err instanceof z.ZodError ? 400 : (err as { statusCode?: number }).statusCode;
    reply.code(code && code >= 400 && code <= 599 ? code : 503).send({ message: "Push relay request rejected" }); });
  app.get("/health", async () => ({ ok: true }));
  app.register(async routes => {
    const tenants = new WeakMap<object, Tenant>();
    routes.addHook("preHandler", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const credential = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      const tenant = credential && db.prepare("SELECT id,origin FROM tenants WHERE credential=? AND enabled=1").get(hash(credential)) as Tenant | undefined;
      if (!tenant) throw error(401);
      tenants.set(request, tenant);
      limit("tenant:" + tenant.id, 300, 60000);
      const now = clock();
      db.prepare("DELETE FROM challenges WHERE expires<=?").run(now);
      db.prepare("DELETE FROM devices WHERE expires<=?").run(now);
      db.prepare("DELETE FROM limits WHERE expires<=?").run(now);
    });
    routes.post("/v1/challenge", async request => {
      const input = registration.extend({ nonce: uuid }).strict().parse(request.body);
      const tenant = tenants.get(request)!;
      const now = clock();
      if (input.projectId !== projectId || input.expiresAt <= now || input.expiresAt > now + 31 * 86400000) throw error(400);
      limit("challenge:" + tenant.id, 20, 60000);
      limit("token:" + hash(input.token), 3, 60000);
      const id = randomUUID(), proof = secret(), expiresAt = now + 120000;
      db.prepare("INSERT INTO challenges VALUES(?,?,?,?,?,?,?,?)").run(id, tenant.id, input.token, input.bindingId, input.sessionKey, hash(proof), expiresAt, input.expiresAt);
      try { await send(input.token, { kind: "relay-challenge", origin: tenant.origin, nonce: input.nonce, bindingId: input.bindingId, challengeId: id, proof, expiresAt: String(expiresAt) }, true); }
      catch { db.prepare("DELETE FROM challenges WHERE id=?").run(id); throw error(503); }
      return { challengeId: id, expiresAt };
    });
    routes.post("/v1/confirm", async request => {
      const input = registration.extend({ challengeId: uuid, proof: hex }).strict().parse(request.body);
      const tenant = tenants.get(request)!;
      const row = db.prepare("SELECT * FROM challenges WHERE id=? AND tenant=?").get(input.challengeId, tenant.id) as Challenge | undefined;
      if (!row || row.expires <= clock() || row.session_expires <= clock() || row.proof !== hash(input.proof) || row.token !== input.token
        || row.binding !== input.bindingId || row.session !== input.sessionKey || input.projectId !== projectId || input.expiresAt !== row.session_expires) throw error(409);
      if ((db.prepare("SELECT count(*) AS n FROM devices WHERE tenant=?").get(tenant.id) as { n: number }).n >= 5000
        && !db.prepare("SELECT handle FROM devices WHERE tenant=? AND token=?").get(tenant.id, input.token)) throw error(429);
      const handle = secret();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM challenges WHERE id=?").run(row.id);
        db.prepare("DELETE FROM devices WHERE tenant=? AND (token=? OR binding=?)").run(tenant.id, row.token, row.binding);
        db.prepare("INSERT INTO devices VALUES(?,?,?,?,?)").run(handle, tenant.id, row.token, row.binding, row.session_expires);
        db.exec("COMMIT");
      } catch (err) { db.exec("ROLLBACK"); throw err; }
      return { handle, expiresAt: row.session_expires };
    });
    routes.post("/v1/revoke", async request => {
      const { handle } = z.object({ handle: hex }).strict().parse(request.body);
      db.prepare("DELETE FROM devices WHERE handle=? AND tenant=?").run(handle, tenants.get(request)!.id);
      return { ok: true };
    });
    routes.post("/v1/send", async request => {
      const input = z.object({ handle: hex, notificationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), expiresAt: z.number().int(),
        title: z.string().trim().min(1).max(100).optional(), body: z.string().trim().min(1).max(240).optional() }).strict().parse(request.body);
      const row = db.prepare("SELECT * FROM devices WHERE handle=? AND tenant=?").get(input.handle, tenants.get(request)!.id) as Device | undefined;
      const now = clock();
      if (!row || row.expires <= now) throw error(410);
      if (input.expiresAt <= now || input.expiresAt > now + 310000) throw error(400);
      limit("device:" + row.handle, 10, 60000);
      try { await send(row.token, { origin: tenants.get(request)!.origin, bindingId: row.binding, notificationId: input.notificationId, expiresAt: String(Math.min(input.expiresAt, row.expires)),
        ...(input.title ? { title: input.title } : {}), ...(input.body ? { body: input.body } : {}) }, false); }
      catch (err) {
        if ((err as { statusCode?: number }).statusCode === 410) { db.prepare("DELETE FROM devices WHERE handle=?").run(row.handle); throw error(410); }
        throw error(503);
      }
      return { ok: true };
    });
  });
  return app;
}
