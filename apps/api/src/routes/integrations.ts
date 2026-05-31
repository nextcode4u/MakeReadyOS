import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiTokenScopes, hashApiToken, requireAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { validateWebhookUrlForRegistration } from "../lib/webhookUrl.js";
import { buildWebhookHeaders, decryptWebhookSecret, encryptWebhookSecret } from "../lib/webhooks.js";
import { webhookEventTypes } from "../lib/webhookQueue.js";

export const apiTokenCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.enum(apiTokenScopes)).min(1).max(apiTokenScopes.length),
  propertyIds: z.array(z.string()).max(100).default([]),
});

export const webhookCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url().refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
    message: "Webhook URL must use http or https",
  }),
  eventTypes: z.array(z.enum(webhookEventTypes)).min(1).max(webhookEventTypes.length),
  propertyIds: z.array(z.string()).max(100).default([]),
});

export const webhookPatchSchema = webhookCreateSchema.partial().extend({
  isEnabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide webhook fields to update" });

export const webhookDeliveryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const webhookTestPayloadSchema = z.object({
  eventType: z.enum(webhookEventTypes).optional(),
  enqueue: z.boolean().default(false),
});

function publicToken(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  tokenLastFour: string;
  scopes: string[];
  isActive: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  propertyScopes: Array<{ property: { id: string; name: string; code: string } }>;
  createdBy: { id: string; fullName: string; email: string };
}) {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    tokenLastFour: token.tokenLastFour,
    scopes: token.scopes,
    isActive: token.isActive,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    createdBy: token.createdBy,
    properties: token.propertyScopes.map((scope) => scope.property),
  };
}

function publicWebhook(webhook: {
  id: string;
  name: string;
  url: string;
  secretLastFour: string;
  eventTypes: string[];
  isEnabled: boolean;
  lastDeliveryAt: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
  propertyScopes: Array<{ property: { id: string; name: string; code: string } }>;
  createdBy: { id: string; fullName: string; email: string };
  _count?: { deliveryAttempts: number };
}) {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    secretLastFour: webhook.secretLastFour,
    eventTypes: webhook.eventTypes,
    isEnabled: webhook.isEnabled,
    lastDeliveryAt: webhook.lastDeliveryAt,
    failureCount: webhook.failureCount,
    deliveryAttemptCount: webhook._count?.deliveryAttempts ?? 0,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    createdBy: webhook.createdBy,
    properties: webhook.propertyScopes.map((scope) => scope.property),
  };
}

async function assertPropertiesExist(propertyIds: string[]) {
  if (propertyIds.length === 0) return true;
  const count = await prisma.property.count({ where: { id: { in: propertyIds }, isActive: true } });
  return count === new Set(propertyIds).size;
}

const tokenInclude = {
  createdBy: { select: { id: true, fullName: true, email: true } },
  propertyScopes: { include: { property: { select: { id: true, name: true, code: true } } } },
} as const;

const webhookInclude = {
  createdBy: { select: { id: true, fullName: true, email: true } },
  propertyScopes: { include: { property: { select: { id: true, name: true, code: true } } } },
  _count: { select: { deliveryAttempts: true } },
} as const;

function publicDeliveryAttempt(attempt: {
  id: string;
  webhookId: string;
  eventType: string;
  status: string;
  deliveryId: string;
  payload: unknown;
  headers: unknown;
  attemptNumber: number;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: attempt.id,
    webhookId: attempt.webhookId,
    eventType: attempt.eventType,
    status: attempt.status,
    deliveryId: attempt.deliveryId,
    payload: attempt.payload,
    headers: attempt.headers,
    attemptNumber: attempt.attemptNumber,
    responseStatus: attempt.responseStatus,
    responseBody: attempt.responseBody,
    errorMessage: attempt.errorMessage,
    nextAttemptAt: attempt.nextAttemptAt,
    deliveredAt: attempt.deliveredAt,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
}

export async function integrationRoutes(app: FastifyInstance) {
  app.get("/admin/integrations", { preHandler: requireAdmin }, async () => {
    const [apiTokens, webhooks, properties] = await Promise.all([
      prisma.apiToken.findMany({
        include: tokenInclude,
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      }),
      prisma.webhookEndpoint.findMany({
        include: webhookInclude,
        orderBy: [{ isEnabled: "desc" }, { createdAt: "desc" }],
      }),
      prisma.property.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { code: "asc" },
      }),
    ]);

    return {
      scopes: apiTokenScopes,
      webhookEvents: webhookEventTypes,
      apiTokens: apiTokens.map(publicToken),
      webhooks: webhooks.map(publicWebhook),
      properties,
      webhookDelivery: "scaffolded",
    };
  });

  app.post("/admin/integrations/api-tokens", { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const payload = apiTokenCreateSchema.parse(request.body);
    if (!(await assertPropertiesExist(payload.propertyIds))) {
      reply.code(400);
      return { message: "Property scope contains an inactive or unknown property" };
    }

    const token = `mro_${randomBytes(32).toString("base64url")}`;
    const created = await prisma.apiToken.create({
      data: {
        name: payload.name,
        tokenHash: hashApiToken(token),
        tokenPrefix: token.slice(0, 7),
        tokenLastFour: token.slice(-4),
        scopes: payload.scopes,
        createdById: user.id,
        propertyScopes: {
          createMany: { data: payload.propertyIds.map((propertyId) => ({ propertyId })) },
        },
      },
      include: tokenInclude,
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "API_TOKEN",
      entityId: created.id,
      action: "API_TOKEN_CREATED",
      message: `Created API token ${created.name}`,
      metadata: { scopes: created.scopes, propertyIds: payload.propertyIds },
    });

    reply.code(201);
    return { apiToken: publicToken(created), token };
  });

  app.post("/admin/integrations/api-tokens/:id/revoke", { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.apiToken.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "API token not found" };
    }

    const revoked = await prisma.apiToken.update({
      where: { id },
      data: { isActive: false, revokedAt: existing.revokedAt ?? new Date() },
      include: tokenInclude,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "API_TOKEN",
      entityId: revoked.id,
      action: "API_TOKEN_REVOKED",
      message: `Revoked API token ${revoked.name}`,
    });
    return { apiToken: publicToken(revoked) };
  });

  app.post("/admin/integrations/webhooks", { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const payload = webhookCreateSchema.parse(request.body);
    const webhookUrlError = validateWebhookUrlForRegistration(payload.url);
    if (webhookUrlError) {
      reply.code(400);
      return { message: webhookUrlError };
    }
    if (!(await assertPropertiesExist(payload.propertyIds))) {
      reply.code(400);
      return { message: "Property scope contains an inactive or unknown property" };
    }

    const secret = `wh_${randomBytes(24).toString("base64url")}`;
    const webhook = await prisma.webhookEndpoint.create({
      data: {
        name: payload.name,
        url: payload.url,
        secretHash: hashApiToken(secret),
        secretCiphertext: encryptWebhookSecret(secret),
        secretLastFour: secret.slice(-4),
        eventTypes: payload.eventTypes,
        createdById: user.id,
        propertyScopes: {
          createMany: { data: payload.propertyIds.map((propertyId) => ({ propertyId })) },
        },
      },
      include: webhookInclude,
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "WEBHOOK_ENDPOINT",
      entityId: webhook.id,
      action: "WEBHOOK_ENDPOINT_CREATED",
      message: `Created webhook endpoint ${webhook.name}`,
      metadata: { eventTypes: webhook.eventTypes, propertyIds: payload.propertyIds, delivery: "scaffolded" },
    });

    reply.code(201);
    return { webhook: publicWebhook(webhook), secret };
  });

  app.get("/admin/integrations/webhooks/:id/deliveries", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const query = webhookDeliveryQuerySchema.parse(request.query);
    const webhook = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { id: true } });
    if (!webhook) {
      reply.code(404);
      return { message: "Webhook endpoint not found" };
    }
    const [deliveries, total] = await Promise.all([
      prisma.webhookDeliveryAttempt.findMany({
        where: { webhookId: id },
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.webhookDeliveryAttempt.count({ where: { webhookId: id } }),
    ]);
    return {
      deliveries: deliveries.map(publicDeliveryAttempt),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + deliveries.length < total,
      },
    };
  });

  app.get("/admin/integrations/webhooks/:id/health", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const webhook = await prisma.webhookEndpoint.findUnique({ where: { id }, include: webhookInclude });
    if (!webhook) {
      reply.code(404);
      return { message: "Webhook endpoint not found" };
    }
    const [statusGroups, eventGroups, latestFailure, oldestPending, total] = await Promise.all([
      prisma.webhookDeliveryAttempt.groupBy({
        by: ["status"],
        where: { webhookId: id },
        _count: { _all: true },
      }),
      prisma.webhookDeliveryAttempt.groupBy({
        by: ["eventType"],
        where: { webhookId: id },
        _count: { _all: true },
      }),
      prisma.webhookDeliveryAttempt.findFirst({
        where: { webhookId: id, status: { in: ["FAILED", "GAVE_UP"] } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.webhookDeliveryAttempt.findFirst({
        where: { webhookId: id, status: { in: ["PENDING", "FAILED"] } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.webhookDeliveryAttempt.count({ where: { webhookId: id } }),
    ]);
    const statusCounts = Object.fromEntries(statusGroups.map((entry) => [entry.status, entry._count._all]));
    const eventCounts = Object.fromEntries(eventGroups.map((entry) => [entry.eventType, entry._count._all]));
    const pendingCount = Number(statusCounts.PENDING ?? 0) + Number(statusCounts.FAILED ?? 0);
    return {
      webhook: publicWebhook(webhook),
      health: {
        state: !webhook.isEnabled ? "DISABLED" : webhook.failureCount > 0 ? "FAILING" : pendingCount > 0 ? "PENDING" : "READY",
        total,
        pendingCount,
        statusCounts,
        eventCounts,
        failureCount: webhook.failureCount,
        lastDeliveryAt: webhook.lastDeliveryAt,
        oldestPendingAt: oldestPending?.createdAt ?? null,
        latestFailure: latestFailure ? publicDeliveryAttempt(latestFailure) : null,
      },
    };
  });

  app.post("/admin/integrations/webhooks/:id/test-payload", { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = webhookTestPayloadSchema.parse(request.body ?? {});
    const webhook = await prisma.webhookEndpoint.findUnique({
      where: { id },
      include: webhookInclude,
    });
    if (!webhook) {
      reply.code(404);
      return { message: "Webhook endpoint not found" };
    }
    if (!webhook.secretCiphertext) {
      reply.code(409);
      return { message: "Webhook endpoint must be recreated or rotated before it can sign payloads" };
    }
    const eventType = payload.eventType ?? webhook.eventTypes[0];
    if (!eventType || !webhook.eventTypes.includes(eventType)) {
      reply.code(400);
      return { message: "Webhook endpoint is not subscribed to the requested event type" };
    }

    const deliveryId = `whd_${randomBytes(16).toString("base64url")}`;
    const eventPayload = {
      format: "makereadyos.webhook",
      version: 1,
      eventType,
      deliveryId,
      generatedAt: new Date().toISOString(),
      test: true,
      data: {
        message: payload.enqueue
          ? "This is a signed MakeReadyOS webhook test payload queued by an admin."
          : "This is a signed MakeReadyOS webhook test payload. No outbound HTTP delivery was attempted.",
      },
    };
    const secret = decryptWebhookSecret(webhook.secretCiphertext);
    const headers = buildWebhookHeaders({ deliveryId, eventType, payload: eventPayload, secret });
    const delivery = await prisma.webhookDeliveryAttempt.create({
      data: {
        webhookId: webhook.id,
        eventType,
        status: payload.enqueue ? "PENDING" : "DRY_RUN",
        deliveryId,
        payload: eventPayload,
        headers,
        errorMessage: payload.enqueue ? null : "Outbound delivery is disabled; this record validates payload signing only.",
      },
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "WEBHOOK_ENDPOINT",
      entityId: webhook.id,
      action: "WEBHOOK_TEST_PAYLOAD_CREATED",
      message: `${payload.enqueue ? "Queued" : "Created"} signed test payload for webhook endpoint ${webhook.name}`,
      metadata: { eventType, deliveryId, queued: payload.enqueue },
    });

    reply.code(201);
    return {
      webhook: publicWebhook(webhook),
      delivery: publicDeliveryAttempt(delivery),
      notice: payload.enqueue
        ? "Payload queued for delivery by run-webhooks.sh."
        : "No outbound HTTP delivery was attempted.",
    };
  });

  app.patch("/admin/integrations/webhooks/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const payload = webhookPatchSchema.parse(request.body);
    const existing = await prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Webhook endpoint not found" };
    }
    if (payload.propertyIds && !(await assertPropertiesExist(payload.propertyIds))) {
      reply.code(400);
      return { message: "Property scope contains an inactive or unknown property" };
    }
    if (payload.url) {
      const webhookUrlError = validateWebhookUrlForRegistration(payload.url);
      if (webhookUrlError) {
        reply.code(400);
        return { message: webhookUrlError };
      }
    }

    const webhook = await prisma.$transaction(async (tx) => {
      if (payload.propertyIds) {
        await tx.webhookPropertyScope.deleteMany({ where: { webhookId: id } });
        if (payload.propertyIds.length > 0) {
          await tx.webhookPropertyScope.createMany({
            data: payload.propertyIds.map((propertyId) => ({ webhookId: id, propertyId })),
          });
        }
      }
      return tx.webhookEndpoint.update({
        where: { id },
        data: {
          name: payload.name,
          url: payload.url,
          eventTypes: payload.eventTypes,
          isEnabled: payload.isEnabled,
        },
        include: webhookInclude,
      });
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "WEBHOOK_ENDPOINT",
      entityId: webhook.id,
      action: "WEBHOOK_ENDPOINT_UPDATED",
      message: `Updated webhook endpoint ${webhook.name}`,
      metadata: { changedKeys: Object.keys(payload) },
    });
    return { webhook: publicWebhook(webhook) };
  });

  app.post("/admin/integrations/webhooks/:id/revoke", { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!existing) {
      reply.code(404);
      return { message: "Webhook endpoint not found" };
    }
    const webhook = await prisma.webhookEndpoint.update({
      where: { id },
      data: { isEnabled: false },
      include: webhookInclude,
    });
    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "WEBHOOK_ENDPOINT",
      entityId: webhook.id,
      action: "WEBHOOK_ENDPOINT_REVOKED",
      message: `Disabled webhook endpoint ${webhook.name}`,
    });
    return { webhook: publicWebhook(webhook) };
  });
}
