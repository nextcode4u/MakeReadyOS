import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { authConfig } from "./lib/config.js";
import { loadSessionUser, requireApiTokenRateLimit, requireApiTokenScope, requireAuthenticated, requireCsrf } from "./lib/auth.js";
import { prisma } from "./lib/prisma.js";
import { authRoutes } from "./routes/auth.js";
import { activityRoutes } from "./routes/activity.js";
import { adminRoutes } from "./routes/admin.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { automationRoutes } from "./routes/automations.js";
import { backupTransferRoutes } from "./routes/backupTransfer.js";
import { customFieldRoutes } from "./routes/customFields.js";
import { collaborationRoutes } from "./routes/collaboration.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { integrationRoutes } from "./routes/integrations.js";
import { makeReadyRoutes } from "./routes/makeReady.js";
import { metaRoutes } from "./routes/meta.js";
import { operationsRoutes } from "./routes/operations.js";
import { operationalLibraryRoutes } from "./routes/operationalLibrary.js";
import { notificationRoutes } from "./routes/notifications.js";
import { planningRoutes } from "./routes/planning.js";
import { propertyMapRoutes } from "./routes/propertyMaps.js";
import { propertyTemplateRoutes } from "./routes/propertyTemplates.js";
import { riskRoutes } from "./routes/risk.js";
import { savedViewRoutes } from "./routes/savedViews.js";
import { vendorRoutes } from "./routes/vendors.js";

const app = Fastify({
  logger: false,
});
const diagnosticsEnabled = process.env.NODE_ENV !== "production" && process.env.ENABLE_API_TIMING_LOGS === "true";
const requestStartedAt = Symbol("requestStartedAt");

if (diagnosticsEnabled) {
  app.addHook("onRequest", async (request) => {
    (request as FastifyRequest & { [requestStartedAt]?: number })[requestStartedAt] = performance.now();
  });
  app.addHook("onResponse", async (request, reply) => {
    const startedAt = (request as FastifyRequest & { [requestStartedAt]?: number })[requestStartedAt];
    const duration = startedAt === undefined ? 0 : performance.now() - startedAt;
    console.info(`[diagnostics] ${request.method} ${request.url} ${reply.statusCode} ${duration.toFixed(1)}ms`);
  });
}

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || authConfig.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed"), false);
  },
  credentials: true,
});

await app.register(cookie, {
  secret: authConfig.sessionCookieSecret,
});

await app.register(multipart, {
  limits: {
    files: 1,
    fileSize: Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024,
  },
});

app.addHook("onRequest", async (request) => {
  await loadSessionUser(request);
});

app.setErrorHandler((error, _request, reply) => {
  const errorStatusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : undefined;
  const statusCode = reply.statusCode >= 400 ? reply.statusCode : errorStatusCode ?? 500;
  reply.code(statusCode).send({
    message: error instanceof Error ? error.message : "Internal server error",
  });
});

app.get("/health", async () => ({ ok: true }));

app.register(async (api) => {
  await authRoutes(api);
}, { prefix: "/api/auth" });

app.register(async (api) => {
  api.addHook("preHandler", requireAuthenticated);
  api.addHook("preHandler", requireApiTokenRateLimit);
  api.addHook("preHandler", requireApiTokenScope);
  api.addHook("preHandler", requireCsrf);
  await activityRoutes(api);
  await adminRoutes(api);
  await analyticsRoutes(api);
  await automationRoutes(api);
  await backupTransferRoutes(api);
  await customFieldRoutes(api);
  await collaborationRoutes(api);
  await dashboardRoutes(api);
  await integrationRoutes(api);
  await makeReadyRoutes(api);
  await metaRoutes(api);
  await operationsRoutes(api);
  await operationalLibraryRoutes(api);
  await notificationRoutes(api);
  await planningRoutes(api);
  await propertyMapRoutes(api);
  await propertyTemplateRoutes(api);
  await riskRoutes(api);
  await savedViewRoutes(api);
  await vendorRoutes(api);
}, {
  prefix: "/api",
});

const port = Number(process.env.PORT || 4000);

const close = async () => {
  await prisma.$disconnect();
  await app.close();
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

app.listen({ port, host: "0.0.0.0" }).catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
