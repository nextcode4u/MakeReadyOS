import type { FastifyInstance } from "fastify";
import { createReadinessCheck } from "../lib/readiness.js";

export const healthPaths = new Set(["/health", "/api/health", "/api/health/ready", "/api/health/database", "/api/health/uploads"]);
export function isHealthRequest(method: string, url: string) {
  return (method === "GET" || method === "HEAD") && healthPaths.has(url.split("?")[0]);
}

export async function healthRoutes(app: FastifyInstance, probes: { database: () => Promise<unknown>; uploads: () => Promise<unknown> }, options?: { timeoutMs?: number; cacheMs?: number }) {
  const database = createReadinessCheck(probes.database, options);
  const uploads = createReadinessCheck(probes.uploads, options);
  for (const path of ["/health", "/api/health"]) {
    app.get(path, async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return { ok: true };
    });
  }
  for (const [name, check] of [["database", database], ["uploads", uploads]] as const) {
    app.get(`/api/health/${name}`, async (_request, reply) => {
      const ok = await check();
      reply.header("Cache-Control", "no-store").code(ok ? 200 : 503);
      return { ok };
    });
  }
  app.get("/api/health/ready", async (_request, reply) => {
    const [databaseOk, uploadsOk] = await Promise.all([database(), uploads()]);
    const ok = databaseOk && uploadsOk;
    reply.header("Cache-Control", "no-store").code(ok ? 200 : 503);
    return { ok, checks: { api: true, database: databaseOk, uploads: uploadsOk } };
  });
}
