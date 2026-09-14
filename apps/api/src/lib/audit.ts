import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { clientIpAddress } from "./auth.js";

export async function writeAuditLog(options: {
  request?: FastifyRequest;
  actorUserId?: string | null;
  propertyId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}, db: Pick<Prisma.TransactionClient, "auditLog"> = prisma) {
  const ipAddress = options.request ? clientIpAddress(options.request) : null;

  await db.auditLog.create({
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
