import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { buildWebhookHeaders, decryptWebhookSecret } from "./webhooks.js";

export const webhookEventTypes = [
  "item.created",
  "item.updated",
  "item.assigned",
  "item.archived",
  "item.restored",
  "item.risk.changed",
  "comment.created",
  "attachment.created",
  "attachment.deleted",
  "vendor.assignment.updated",
  "checklist.completed",
  "project.record.created",
  "project.record.updated",
  "project.record.archived",
  "pest.issue.created",
  "pest.issue.updated",
  "pest.issue.archived",
  "pm.template.created",
  "pm.template.updated",
  "pm.task.completed",
  "pm.task.skipped",
  "pool.entry.created",
  "lease.issue.created",
  "lease.issue.updated",
  "lease.issue.resolved",
  "lease.issue.archived",
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];

type QueueWebhookEventInput = {
  eventType: WebhookEventType;
  propertyId?: string | null;
  itemId?: string | null;
  actorUserId?: string | null;
  data: Record<string, unknown>;
};

export async function queueWebhookEvent(input: QueueWebhookEventInput) {
  try {
    const webhooks = await prisma.webhookEndpoint.findMany({
      where: {
        isEnabled: true,
        eventTypes: { has: input.eventType },
        OR: input.propertyId
          ? [{ propertyScopes: { none: {} } }, { propertyScopes: { some: { propertyId: input.propertyId } } }]
          : [{ propertyScopes: { none: {} } }],
      },
      select: {
        id: true,
        secretCiphertext: true,
      },
    });
    const queued: string[] = [];
    for (const webhook of webhooks) {
      const deliveryId = `whd_${randomBytes(16).toString("base64url")}`;
      const payload = {
        format: "makereadyos.webhook",
        version: 1,
        eventType: input.eventType,
        deliveryId,
        generatedAt: new Date().toISOString(),
        propertyId: input.propertyId ?? null,
        itemId: input.itemId ?? null,
        actorUserId: input.actorUserId ?? null,
        data: input.data as Prisma.InputJsonObject,
      } satisfies Prisma.InputJsonObject;
      if (!webhook.secretCiphertext) {
        await prisma.webhookDeliveryAttempt.create({
          data: {
            webhookId: webhook.id,
            eventType: input.eventType,
            status: "GAVE_UP",
            deliveryId,
            payload,
            errorMessage: "Webhook endpoint has no encrypted signing secret; recreate or rotate it before delivery.",
          },
        });
        continue;
      }
      const secret = decryptWebhookSecret(webhook.secretCiphertext);
      const headers = buildWebhookHeaders({ deliveryId, eventType: input.eventType, payload, secret });
      await prisma.webhookDeliveryAttempt.create({
        data: {
          webhookId: webhook.id,
          eventType: input.eventType,
          status: "PENDING",
          deliveryId,
          payload,
          headers,
        },
      });
      queued.push(deliveryId);
    }
    return { queuedCount: queued.length, deliveryIds: queued };
  } catch (error) {
    console.warn("Webhook event queueing failed:", error instanceof Error ? error.message : error);
    return { queuedCount: 0, deliveryIds: [], error: error instanceof Error ? error.message : String(error) };
  }
}
