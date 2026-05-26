import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

export async function writeAuditLog(options: {
  request?: FastifyRequest;
  actorUserId?: string | null;
  propertyId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const forwarded = options.request?.headers["x-forwarded-for"];
  const ipAddress =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : options.request?.ip ?? null;

  await prisma.auditLog.create({
    data: {
      actorUserId: options.actorUserId ?? null,
      propertyId: options.propertyId ?? null,
      entityType: options.entityType,
      entityId: options.entityId ?? null,
      action: options.action,
      message: options.message,
      metadata: options.metadata as never,
      ipAddress,
    },
  });
}
