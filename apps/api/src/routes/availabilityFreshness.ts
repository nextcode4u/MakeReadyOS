import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { availabilityReceipt } from "../lib/availabilityReceipt.js";
import { prisma } from "../lib/prisma.js";

export async function availabilityFreshnessRoutes(app: FastifyInstance) {
  app.get("/operations/availability/status", async (request, reply) => {
    if (!request.currentUser || request.authType === "apiToken") return reply.code(403).send({ message: "Staff session required" });
    const { propertyId } = z.object({ propertyId: z.string().min(1).optional() }).parse(request.query);
    const ids = allowedPropertyIds(request.currentUser);
    if (propertyId && ids !== null && !ids.includes(propertyId)) return reply.code(403).send({ message: "Property access denied" });
    const properties = await prisma.property.findMany({
      where: { isActive: true, id: propertyId ?? (ids === null ? undefined : { in: ids }) },
      select: { id: true, code: true, name: true }, orderBy: { code: "asc" },
    });
    if (propertyId && !properties.length) return reply.code(404).send({ message: "Active property not found" });
    reply.header("Cache-Control", "no-store");
    return { properties: await Promise.all(properties.map(async property => ({
      ...property,
      latestImport: availabilityReceipt(await prisma.auditLog.findFirst({
        where: { propertyId: property.id, entityType: "AVAILABILITY_IMPORT", action: "AVAILABILITY_IMPORTED" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true, metadata: true },
      })),
    }))) };
  });
}
