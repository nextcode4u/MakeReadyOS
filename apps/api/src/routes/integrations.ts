import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiTokenScopes, hashApiToken, requireAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

const webhookEvents = [
  "item.created",
  "item.updated",
  "item.assigned",
  "item.risk.changed",
  "comment.created",
  "vendor.assignment.updated",
  "checklist.completed",
] as const;

const tokenCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.enum(apiTokenScopes)).min(1).max(apiTokenScopes.length),
  propertyIds: z.array(z.string()).max(100).default([]),
});

const webhookCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url().refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
    message: "Webhook URL must use http or https",
  }),
  eventTypes: z.array(z.enum(webhookEvents)).min(1).max(webhookEvents.length),
  propertyIds: z.array(z.string()).max(100).default([]),
});

const webhookPatchSchema = webhookCreateSchema.partial().extend({
  isEnabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Provide webhook fields to update" });

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
} as const;

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
      webhookEvents,
      apiTokens: apiTokens.map(publicToken),
      webhooks: webhooks.map(publicWebhook),
      properties,
      webhookDelivery: "scaffolded",
    };
  });

  app.post("/admin/integrations/api-tokens", { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.currentUser!;
    const payload = tokenCreateSchema.parse(request.body);
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
