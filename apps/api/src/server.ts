import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { authConfig } from "./lib/config.js";
import { loadSessionUser, requireApiTokenRateLimit, requireApiTokenScope, requireAuthenticated, requireCsrf } from "./lib/auth.js";
import { openApiDocument } from "./lib/openapi.js";
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
import { preventiveMaintenanceRoutes } from "./routes/preventiveMaintenance.js";
import { projectRoutes } from "./routes/projects.js";
import { poolLogRoutes } from "./routes/poolLog.js";
import { pestControlRoutes } from "./routes/pestControl.js";
import { leaseComplianceRoutes } from "./routes/leaseCompliance.js";
import { propertyWikiRoutes } from "./routes/propertyWiki.js";
import { propertyMapRoutes } from "./routes/propertyMaps.js";
import { propertyTemplateRoutes } from "./routes/propertyTemplates.js";
import { refrigerantRoutes } from "./routes/refrigerant.js";
import { riskRoutes } from "./routes/risk.js";
import { savedViewRoutes } from "./routes/savedViews.js";
import { vendorRoutes } from "./routes/vendors.js";

const app = Fastify({
  logger: false,
});
const diagnosticsEnabled = process.env.NODE_ENV !== "production" && process.env.ENABLE_API_TIMING_LOGS === "true";
const requestStartedAt = Symbol("requestStartedAt");
const configuredMaxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 0);
const multipartLimits = configuredMaxUploadMb > 0
  ? { files: 1, fileSize: configuredMaxUploadMb * 1024 * 1024 }
  : { files: 1, fileSize: Number.MAX_SAFE_INTEGER };

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
  limits: multipartLimits,
});

app.addHook("onRequest", async (request) => {
  await loadSessionUser(request);
});

app.setErrorHandler((error, _request, reply) => {
  const errorStatusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : undefined;
  const statusCode = reply.statusCode >= 400 ? reply.statusCode : errorStatusCode ?? 500;
  const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
  if (statusCode === 413 || code === "FST_REQ_FILE_TOO_LARGE") {
    const limitText = configuredMaxUploadMb > 0
      ? `${configuredMaxUploadMb} MB`
      : "the active reverse proxy or browser limit";
    reply.code(413).send({
      message: `Upload is too large for ${limitText}. If this is a high-resolution photo batch, upload fewer files at once or increase the reverse-proxy/body-size limit.`,
    });
    return;
  }
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const fieldName = firstIssue?.path.length ? firstIssue.path.join(".") : "Input";
    const message = firstIssue?.message
      ? firstIssue.message
      : `${fieldName} is invalid.`;
    reply.code(400).send({ message });
    return;
  }
  reply.code(statusCode).send({
    message: error instanceof Error ? error.message : "Internal server error",
  });
});

app.get("/health", async () => ({ ok: true }));
app.get("/openapi.json", async () => openApiDocument);
app.get("/api/openapi.json", async () => openApiDocument);

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
  await pestControlRoutes(api);
  await leaseComplianceRoutes(api);
  await preventiveMaintenanceRoutes(api);
  await projectRoutes(api);
  await poolLogRoutes(api);
  await propertyWikiRoutes(api);
  await propertyMapRoutes(api);
  await propertyTemplateRoutes(api);
  await refrigerantRoutes(api);
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
