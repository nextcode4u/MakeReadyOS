import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { allowedPropertyIds } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { authConfig } from "../lib/config.js";
import { accessCodeValues, parseCodeCsv, syncUnitCodes, unitMatchKey } from "../lib/unitAccessCodes.js";

export async function accessCodeRoutes(app: FastifyInstance) {
  const secret = authConfig.sessionCookieSecret;
  async function access(request: FastifyRequest, manage = false) {
    const user = request.currentUser;
    const canView = user && (["ADMIN", "MANAGER", "TECH", "LEASING"].includes(user.role) || ["PAINTER", "CLEANER"].includes(user.role) && user.keycodeAccess === true);
    if (!user || request.authType === "apiToken" || (manage ? !["ADMIN", "MANAGER"].includes(user.role) : !canView)) throw Object.assign(new Error("Access denied"), { statusCode: 403 });
    const { propertyId } = z.object({ propertyId: z.string().min(1) }).parse(request.params);
    const ids = allowedPropertyIds(user);
    if (ids && !ids.includes(propertyId)) throw Object.assign(new Error("Property access denied"), { statusCode: 403 });
    const property = await prisma.property.findFirst({ where: { id: propertyId, isActive: true }, select: { id: true, code: true, name: true } });
    if (!property) throw Object.assign(new Error("Active property not found"), { statusCode: 404 });
    return property;
  }
  app.get("/access-codes/:propertyId", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const property = await access(request);
    const units = await prisma.unit.findMany({ where: { propertyId: property.id, isActive: true }, select: { id: true, number: true, mailboxNumber: true, accessCodes: { select: { version: true, updatedAt: true } } }, orderBy: { number: "asc" } });
    return { property, units, canManage: ["ADMIN", "MANAGER"].includes(request.currentUser!.role) };
  });
  app.get("/access-codes/:propertyId/units/:unitId", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const property = await access(request);
    const { unitId } = z.object({ unitId: z.string() }).parse(request.params);
    const unit = await prisma.unit.findFirst({ where: { id: unitId, propertyId: property.id, isActive: true }, include: { accessCodes: true } });
    if (!unit) return reply.code(404).send({ message: "Unit not found" });
    await prisma.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "UNIT", entityId: unit.id, action: "ACCESS_CODES_VIEWED", message: "Viewed unit access codes (values excluded from audit)" } });
    return { version: unit.accessCodes?.version ?? 0, value: accessCodeValues.parse(unit.accessCodes ? { doorCode: unit.accessCodes.doorCode, accessCode: unit.accessCodes.accessCode, keyCode: unit.accessCodes.keyCode } : { doorCode: "", accessCode: "", keyCode: "" }) };
  });
  app.put("/access-codes/:propertyId/units/:unitId", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const property = await access(request, true);
    const { unitId } = z.object({ unitId: z.string() }).parse(request.params);
    const input = z.object({ version: z.number().int().nonnegative(), value: accessCodeValues }).strict().parse(request.body);
    await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${property.id}), 824018)::text`;
      const unit = await db.unit.findFirst({ where: { id: unitId, propertyId: property.id, isActive: true }, include: { accessCodes: true } });
      if (!unit || (unit.accessCodes?.version ?? 0) !== input.version) throw Object.assign(new Error("Codes changed or unit unavailable. Reload before saving."), { statusCode: 409 });
      await syncUnitCodes(db, unitId, input.value);
      await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "UNIT", entityId: unitId, action: "ACCESS_CODES_UPDATED", message: "Updated unit access codes (values excluded from audit)" } });
    });
    return { saved: true };
  });
  app.post("/access-codes/:propertyId/export", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const property = await access(request, true);
    const units = await prisma.unit.findMany({ where: { propertyId: property.id, isActive: true }, include: { accessCodes: true }, orderBy: { number: "asc" } });
    // A JSON download avoids spreadsheet formula execution and preserves exact codes/zeros.
    const rows = units.map(unit => ({ unit: unit.number, doorCode: unit.accessCodes?.doorCode ?? "", accessCode: unit.accessCodes?.accessCode ?? "", keyCode: unit.accessCodes?.keyCode ?? "" }));
    await prisma.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "PROPERTY", entityId: property.id, action: "ACCESS_CODES_EXPORTED", message: `Exported ${rows.length} unit code records (values excluded from audit)` } });
    return { propertyCode: property.code, format: "makereadyos-access-codes-v1", rows };
  });
  app.post("/access-codes/:propertyId/import", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const property = await access(request, true);
    const input = z.object({ text: z.string().min(1).max(1000000), overwrite: z.boolean().default(false), skipInvalid: z.boolean().default(false), token: z.string().optional() }).strict().parse(request.body);
    let rows: Array<{ number: string; doorCode: string; accessCode: string; keyCode: string }>;
    try {
      if (input.text.trimStart().startsWith("{")) {
        const file = z.object({ format: z.literal("makereadyos-access-codes-v1"), propertyCode: z.string(), rows: z.array(accessCodeValues.extend({ unit: z.string().min(1) })).min(1).max(5000) }).strict().parse(JSON.parse(input.text));
        if (file.propertyCode !== property.code) throw new Error("The export belongs to another property");
        rows = file.rows.map(({ unit, ...value }) => ({ number: unit, ...value }));
      } else rows = parseCodeCsv(input.text);
    } catch (error) { return reply.code(400).send({ message: error instanceof Error && ! (error instanceof z.ZodError) ? error.message : "Invalid access-code file" }); }
    return prisma.$transaction(async db => {
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${property.id}), 824018)::text`;
      const units = await db.unit.findMany({ where: { propertyId: property.id, isActive: true }, include: { accessCodes: true } });
      const errors: string[] = [];
      const changes: Array<{ id: string; number: string; version: number; value: z.infer<typeof accessCodeValues> }> = [];
      for (const [index, row] of rows.entries()) {
        const key = unitMatchKey(row.number);
        const matches = units.filter(unit => unitMatchKey(unit.number) === key);
        if (matches.length !== 1 || rows.filter(other => unitMatchKey(other.number) === key).length !== 1) { errors.push(`Row ${index + 2}: unknown, ambiguous or duplicate unit ${row.number}`); continue; }
        const unit = matches[0];
        const old = unit.accessCodes ?? { doorCode: "", accessCode: "", keyCode: "", version: 0 };
        const value = { doorCode: old.doorCode, accessCode: old.accessCode, keyCode: old.keyCode };
        for (const name of ["doorCode", "accessCode", "keyCode"] as const) if (row[name] && (input.overwrite || !old[name])) value[name] = row[name];
        if (Object.keys(value).some(name => value[name as keyof typeof value] !== old[name as keyof typeof value])) changes.push({ id: unit.id, number: unit.number, version: old.version, value });
      }
      const token = createHmac("sha256", secret).update(JSON.stringify({ propertyId: property.id, changes, errors })).digest("hex");
      if (input.token) {
        if (input.token !== token) return reply.code(409).send({ message: "Directory changed. Preview again." });
        if (errors.length && !input.skipInvalid) return reply.code(400).send({ message: "Resolve invalid rows or explicitly skip them" });
        if (!changes.length) return reply.code(400).send({ message: "No changes to apply" });
        for (const change of changes) await syncUnitCodes(db, change.id, change.value);
        await db.auditLog.create({ data: { actorUserId: request.currentUser!.id, propertyId: property.id, entityType: "PROPERTY", entityId: property.id, action: "ACCESS_CODES_IMPORTED", message: `Imported codes for ${changes.length} units; skipped ${errors.length} invalid rows` } });
      }
      return { token, errors, units: changes.map(change => change.number), applied: Boolean(input.token) };
    });
  });
}
