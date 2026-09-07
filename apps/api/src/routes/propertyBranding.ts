import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";

// Browser-normalized PNGs only: no external URLs, SVG scripts or remote image fetching.
export const brandingLogoSchema = z.string().max(200000).refine(value => {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const bytes = Buffer.from(value.slice(22), "base64");
  return bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString("ascii", 12, 16) === "IHDR" && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 512
    && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 512;
}, "Use a PNG logo up to 512px and 150 KB").nullable();
export const companyInputSchema = z.object({ name: z.string().trim().min(2).max(120), logo: brandingLogoSchema.optional() });

export async function propertyBrandingRoutes(app: FastifyInstance) {
  app.get("/management-companies", async request => {
    const ids = allowedPropertyIds(request.currentUser!);
    return { companies: await prisma.managementCompany.findMany({ where: ids === null ? {} : { properties: { some: { propertyId: { in: ids } } } }, orderBy: { name: "asc" } }) };
  });
  app.post("/management-companies", async (request, reply) => {
    if (request.currentUser!.role !== "ADMIN") return reply.code(403).send({ message: "Only admins manage company branding" });
    const input = companyInputSchema.parse(request.body);
    if (await prisma.managementCompany.findUnique({ where: { name: input.name } })) return reply.code(409).send({ message: "A company with that name already exists. Select it instead." });
    const company = await prisma.managementCompany.create({ data: input });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "MANAGEMENT_COMPANY", entityId: company.id, action: "COMPANY_CREATED", message: `Created management company ${company.name}` });
    return reply.code(201).send({ company });
  });
  app.patch("/management-companies/:id", async (request, reply) => {
    if (request.currentUser!.role !== "ADMIN") return reply.code(403).send({ message: "Only admins manage company branding" });
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = companyInputSchema.partial().parse(request.body);
    if (!(await prisma.managementCompany.findUnique({ where: { id } }))) return reply.code(404).send({ message: "Company not found" });
    if (input.name && await prisma.managementCompany.findFirst({ where: { name: input.name, id: { not: id } } })) return reply.code(409).send({ message: "A company with that name already exists" });
    const company = await prisma.managementCompany.update({ where: { id }, data: input });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, entityType: "MANAGEMENT_COMPANY", entityId: id, action: "COMPANY_UPDATED", message: "Updated shared company branding" });
    return { company };
  });
  app.get("/property-branding/:propertyId", async (request, reply) => {
    const { propertyId } = z.object({ propertyId: z.string() }).parse(request.params);
    const ids = allowedPropertyIds(request.currentUser!);
    if (ids !== null && !ids.includes(propertyId)) return reply.code(403).send({ message: "Property access denied" });
    const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, code: true, name: true, branding: { include: { managementCompany: true } } } });
    if (!property) return reply.code(404).send({ message: "Property not found" });
    return { property };
  });
  app.put("/property-branding/:propertyId", async (request, reply) => {
    // Company relationships are portfolio configuration, not a field-work permission.
    if (request.currentUser!.role !== "ADMIN") return reply.code(403).send({ message: "Only admins edit property branding" });
    const { propertyId } = z.object({ propertyId: z.string() }).parse(request.params);
    const input = z.object({ managementCompanyId: z.string().min(1).nullable(), logo: brandingLogoSchema }).parse(request.body);
    if (!(await prisma.property.findUnique({ where: { id: propertyId } }))) return reply.code(404).send({ message: "Property not found" });
    if (input.managementCompanyId && !(await prisma.managementCompany.findUnique({ where: { id: input.managementCompanyId } }))) return reply.code(400).send({ message: "Select an existing management company" });
    const branding = await prisma.propertyBranding.upsert({ where: { propertyId }, create: { propertyId, ...input }, update: input, include: { managementCompany: true } });
    await writeAuditLog({ request, actorUserId: request.currentUser!.id, propertyId, entityType: "PROPERTY", entityId: propertyId, action: "PROPERTY_BRANDING_UPDATED", message: "Updated property logo and management company selection" });
    return { branding };
  });
}
