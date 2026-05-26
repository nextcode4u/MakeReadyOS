import { UserRole } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { assertStrongPassword } from "../lib/config.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

const editableRoles = z.nativeEnum(UserRole);

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  role: editableRoles,
  password: z.string().min(12),
  isActive: z.boolean().default(true),
  propertyIds: z.array(z.string()).default([]),
});

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  role: editableRoles.optional(),
  isActive: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(12),
});

const updatePropertyAccessSchema = z.object({
  propertyIds: z.array(z.string()),
});

function serializeUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  propertyAccess: Array<{ propertyId: string; role: UserRole }>;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    propertyAccess: user.propertyAccess.map((access) => ({
      propertyId: access.propertyId,
      role: access.role,
    })),
  };
}

async function ensureAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (await requireAdmin(request, reply)) {
    return false;
  }
  return true;
}

async function ensureUserExists(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { propertyAccess: true },
  });

  return user;
}

async function ensurePropertiesExist(propertyIds: string[]) {
  if (propertyIds.length === 0) {
    return;
  }

  const count = await prisma.property.count({
    where: {
      id: { in: propertyIds },
      isActive: true,
    },
  });

  if (count !== propertyIds.length) {
    throw new Error("One or more selected properties are invalid");
  }
}

async function activeAdminCount() {
  return prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
}

async function enforceLastAdminProtection(options: {
  targetUserId: string;
  nextRole?: UserRole;
  nextIsActive?: boolean;
  actorUserId: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: options.targetUserId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const effectiveRole = options.nextRole ?? user.role;
  const effectiveIsActive = options.nextIsActive ?? user.isActive;

  if (user.role === UserRole.ADMIN && user.isActive && (effectiveRole !== UserRole.ADMIN || !effectiveIsActive)) {
    const admins = await activeAdminCount();
    if (admins <= 1) {
      if (options.actorUserId === user.id) {
        throw new Error("You cannot remove or deactivate yourself as the last active ADMIN");
      }
      throw new Error("Cannot remove or deactivate the last active ADMIN");
    }
  }
}

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/users", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const users = await prisma.user.findMany({
      include: {
        propertyAccess: {
          orderBy: { propertyId: "asc" },
        },
      },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });

    return {
      users: users.map(serializeUser),
    };
  });

  app.get("/admin/properties", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const properties = await prisma.property.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });

    return {
      properties,
    };
  });

  app.post("/admin/users", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const actor = request.currentUser!;
    const payload = createUserSchema.parse(request.body);
    try {
      assertStrongPassword(payload.password, "password");
      await ensurePropertiesExist(payload.propertyIds);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid input" };
    }
    const email = payload.email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      reply.code(409);
      return { message: "A user with that email already exists" };
    }

    const passwordHash = await hashPassword(payload.password);
    const created = await prisma.user.create({
      data: {
        email,
        fullName: payload.fullName,
        role: payload.role,
        isActive: payload.isActive,
        passwordHash,
        propertyAccess: payload.role === UserRole.ADMIN
          ? undefined
          : {
              create: payload.propertyIds.map((propertyId) => ({
                propertyId,
                role: payload.role,
              })),
            },
      },
      include: { propertyAccess: true },
    });

    await writeAuditLog({
      request,
      actorUserId: actor.id,
      entityType: "USER",
      entityId: created.id,
      action: "USER_CREATED",
      message: `Created user ${created.email}`,
      metadata: {
        role: created.role,
        isActive: created.isActive,
        propertyIds: payload.propertyIds,
      },
    });

    reply.code(201);
    return {
      user: serializeUser(created),
    };
  });

  app.patch("/admin/users/:id", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const actor = request.currentUser!;
    const params = z.object({ id: z.string() }).parse(request.params);
    const payload = updateUserSchema.parse(request.body);
    const existing = await ensureUserExists(params.id);

    if (!existing) {
      reply.code(404);
      return { message: "User not found" };
    }

    const nextEmail = payload.email?.toLowerCase();
    if (nextEmail && nextEmail !== existing.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (duplicate) {
        reply.code(409);
        return { message: "A user with that email already exists" };
      }
    }

    try {
      await enforceLastAdminProtection({
        targetUserId: existing.id,
        nextRole: payload.role,
        nextIsActive: payload.isActive,
        actorUserId: actor.id,
      });
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid update" };
    }

    const roleChanged = payload.role && payload.role !== existing.role;
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: payload.fullName,
        email: nextEmail,
        role: payload.role,
        isActive: payload.isActive,
        propertyAccess: payload.role && payload.role !== UserRole.ADMIN
          ? {
              updateMany: {
                where: {},
                data: { role: payload.role },
              },
            }
          : payload.role === UserRole.ADMIN
            ? {
                deleteMany: {},
              }
            : undefined,
      },
      include: { propertyAccess: true },
    });

    await writeAuditLog({
      request,
      actorUserId: actor.id,
      entityType: "USER",
      entityId: updated.id,
      action: roleChanged ? "USER_ROLE_CHANGED" : "USER_UPDATED",
      message: `${roleChanged ? "Changed role for" : "Updated"} user ${updated.email}`,
      metadata: {
        previousRole: existing.role,
        nextRole: updated.role,
        isActive: updated.isActive,
      },
    });

    return {
      user: serializeUser(updated),
    };
  });

  app.post("/admin/users/:id/reset-password", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const actor = request.currentUser!;
    const params = z.object({ id: z.string() }).parse(request.params);
    const payload = resetPasswordSchema.parse(request.body);
    try {
      assertStrongPassword(payload.password, "password");
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid password" };
    }
    const existing = await ensureUserExists(params.id);

    if (!existing) {
      reply.code(404);
      return { message: "User not found" };
    }

    const passwordHash = await hashPassword(payload.password);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
    await prisma.session.deleteMany({
      where: { userId: existing.id },
    });

    await writeAuditLog({
      request,
      actorUserId: actor.id,
      entityType: "USER",
      entityId: existing.id,
      action: "USER_PASSWORD_RESET",
      message: `Reset password for ${existing.email}`,
    });

    return { ok: true };
  });

  app.delete("/admin/users/:id", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const actor = request.currentUser!;
    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await ensureUserExists(params.id);

    if (!existing) {
      reply.code(404);
      return { message: "User not found" };
    }

    try {
      await enforceLastAdminProtection({
        targetUserId: existing.id,
        nextIsActive: false,
        actorUserId: actor.id,
      });
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid deactivation" };
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: false },
      include: { propertyAccess: true },
    });
    await prisma.session.deleteMany({
      where: { userId: updated.id },
    });

    await writeAuditLog({
      request,
      actorUserId: actor.id,
      entityType: "USER",
      entityId: updated.id,
      action: "USER_DEACTIVATED",
      message: `Deactivated user ${updated.email}`,
    });

    return {
      user: serializeUser(updated),
    };
  });

  app.put("/admin/users/:id/property-access", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const actor = request.currentUser!;
    const params = z.object({ id: z.string() }).parse(request.params);
    const payload = updatePropertyAccessSchema.parse(request.body);
    const existing = await ensureUserExists(params.id);

    if (!existing) {
      reply.code(404);
      return { message: "User not found" };
    }

    try {
      await ensurePropertiesExist(payload.propertyIds);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Invalid property access" };
    }

    const propertyIds = Array.from(new Set(payload.propertyIds));
    if (existing.role === UserRole.ADMIN && propertyIds.length > 0) {
      reply.code(400);
      return { message: "ADMIN users do not require explicit property assignments" };
    }

    await prisma.$transaction([
      prisma.userPropertyAccess.deleteMany({
        where: { userId: existing.id },
      }),
      ...(existing.role === UserRole.ADMIN
        ? []
        : [
            prisma.userPropertyAccess.createMany({
              data: propertyIds.map((propertyId) => ({
                userId: existing.id,
                propertyId,
                role: existing.role,
              })),
            }),
          ]),
    ]);

    const updated = await ensureUserExists(existing.id);
    if (!updated) {
      reply.code(404);
      return { message: "User not found" };
    }

    await writeAuditLog({
      request,
      actorUserId: actor.id,
      entityType: "USER",
      entityId: updated.id,
      action: "USER_PROPERTY_ACCESS_UPDATED",
      message: `Updated property access for ${updated.email}`,
      metadata: {
        propertyIds,
      },
    });

    return {
      user: serializeUser(updated),
    };
  });
}
