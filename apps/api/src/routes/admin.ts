import { UserRole } from "@prisma/client";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, statfs, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { assertStrongPassword } from "../lib/config.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { sanitizeUploadSegment } from "../lib/uploadStorage.js";

const editableRoles = z.nativeEnum(UserRole);

export const adminCreateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  role: editableRoles,
  password: z.string().min(12),
  isActive: z.boolean().default(true),
  propertyIds: z.array(z.string()).default([]),
});

export const adminUpdateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  role: editableRoles.optional(),
  isActive: z.boolean().optional(),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(12),
});

export const adminUpdatePropertyAccessSchema = z.object({
  propertyIds: z.array(z.string()),
});

export const adminStoragePathSchema = z.object({
  hostPath: z.string().trim().min(1).max(500),
});
export const adminPropertyStorageRoutingSchema = z.object({
  propertyId: z.string(),
  uploadStorageMode: z.enum(["DEFAULT", "PROPERTY_SUBDIR"]),
  uploadSubdir: z.string().trim().max(160).nullable().optional(),
});

const unsafeHostPaths = new Set(["/", "/tmp", "/var/tmp", "/root", "/home", "/mnt", "/media", "/srv"]);

function configuredUploadDir() {
  return resolve(process.env.UPLOAD_DIR || "uploads");
}

function configuredHostPath() {
  return process.env.UPLOADS_HOST_PATH || "uploads_data";
}

function maxUploadMb() {
  return Number(process.env.MAX_UPLOAD_MB ?? 0);
}

function validateHostUploadPath(hostPath: string) {
  if (!hostPath.startsWith("/")) {
    return {
      normalizedPath: hostPath,
      safe: false,
      errors: ["Use an absolute Linux host path such as /mnt/storage/makereadyos-uploads."],
      warnings: [],
    };
  }

  const normalizedPath = resolve(hostPath);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (unsafeHostPaths.has(normalizedPath)) {
    errors.push("Path is too broad. Use a dedicated folder, not a root system directory.");
  }
  if (!normalizedPath.includes("makereadyos") && !normalizedPath.includes("uploads")) {
    warnings.push("Use a clearly dedicated folder name so uploads are not mixed with unrelated files.");
  }
  if (normalizedPath.includes("'") || normalizedPath.includes("\n")) {
    errors.push("Path contains unsupported characters.");
  }

  return {
    normalizedPath,
    safe: errors.length === 0,
    errors,
    warnings,
  };
}

async function inspectUploadDir() {
  const uploadDir = configuredUploadDir();
  const probeName = `.makereadyos-write-check-${Date.now()}`;
  const probePath = resolve(uploadDir, probeName);
  let writable = false;
  let error: string | null = null;
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;

  try {
    await mkdir(uploadDir, { recursive: true });
    await access(uploadDir, fsConstants.R_OK | fsConstants.W_OK);
    await writeFile(probePath, "ok");
    await unlink(probePath).catch(() => undefined);
    writable = true;
  } catch (nextError) {
    error = nextError instanceof Error ? nextError.message : "Upload directory is not writable";
  }

  try {
    const stats = await statfs(uploadDir);
    freeBytes = Number(stats.bavail) * Number(stats.bsize);
    totalBytes = Number(stats.blocks) * Number(stats.bsize);
  } catch {
    // Filesystem stats are best-effort; some containers/filesystems do not expose them.
  }

  return {
    uploadDir,
    writable,
    freeBytes,
    totalBytes,
    error,
  };
}

function storageCommands(targetHostPath: string) {
  return {
    dryRun: `./move-uploads.sh ${targetHostPath} --dry-run`,
    move: `./move-uploads.sh ${targetHostPath}`,
    env: `UPLOADS_HOST_PATH=${targetHostPath}\nUPLOAD_DIR=/app/uploads`,
    restart: "docker compose up -d",
    backup: "./backup-db.sh && ./backup-uploads.sh",
  };
}

function serializePropertyStorage(property: { id: string; code: string; name: string; uploadStorageMode: string; uploadSubdir: string | null }) {
  const fallbackSubdir = sanitizeUploadSegment(property.code);
  return {
    id: property.id,
    code: property.code,
    name: property.name,
    uploadStorageMode: property.uploadStorageMode,
    uploadSubdir: property.uploadSubdir,
    effectiveSubdir: property.uploadStorageMode === "PROPERTY_SUBDIR" ? sanitizeUploadSegment(property.uploadSubdir || property.code) : null,
    suggestedSubdir: fallbackSubdir,
  };
}

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

  app.get("/admin/storage", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const hostPath = configuredHostPath();
    const current = await inspectUploadDir();
    const isHostPath = hostPath.startsWith("/");
    const properties = await prisma.property.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, uploadStorageMode: true, uploadSubdir: true },
    });
    return {
      storage: {
        mode: isHostPath ? "HOST_PATH" : "DOCKER_VOLUME",
        uploadDir: current.uploadDir,
        hostPath,
        maxUploadMb: maxUploadMb(),
        uploadLimitDisabled: maxUploadMb() <= 0,
        uploadLimitLabel: maxUploadMb() > 0 ? `${maxUploadMb()} MB per file` : "No MakeReadyOS per-file limit",
        bundledProxyLimit: "unlimited",
        current,
        activationRequiresRestart: true,
        notes: [
          "The web UI can validate and guide storage changes, but Docker must mount the final host/NAS path.",
          "Copy and verify existing uploads before changing UPLOADS_HOST_PATH.",
          "Database backup alone does not include photos, attachments, or property map files.",
          "Large upload failures usually come from an external reverse proxy, browser memory, or host storage limits, not PostgreSQL.",
        ],
        propertyRouting: properties.map(serializePropertyStorage),
      },
    };
  });

  app.patch("/admin/storage/property-routing", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const payload = adminPropertyStorageRoutingSchema.parse(request.body);
    const property = await prisma.property.findUnique({
      where: { id: payload.propertyId },
      select: { id: true, code: true, name: true, uploadStorageMode: true, uploadSubdir: true },
    });
    if (!property) return reply.code(404).send({ message: "Property not found" });
    const cleanSubdir = payload.uploadStorageMode === "PROPERTY_SUBDIR"
      ? sanitizeUploadSegment(payload.uploadSubdir || property.code)
      : null;
    if (payload.uploadStorageMode === "PROPERTY_SUBDIR" && !cleanSubdir) {
      return reply.code(400).send({ message: "Property upload folder must contain at least one safe path segment" });
    }
    const updated = await prisma.property.update({
      where: { id: payload.propertyId },
      data: {
        uploadStorageMode: payload.uploadStorageMode,
        uploadSubdir: cleanSubdir,
      },
      select: { id: true, code: true, name: true, uploadStorageMode: true, uploadSubdir: true },
    });
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      propertyId: updated.id,
      entityType: "PROPERTY",
      entityId: updated.id,
      action: "PROPERTY_UPLOAD_ROUTING_UPDATED",
      message: `Updated upload routing for ${updated.code}`,
      metadata: {
        uploadStorageMode: updated.uploadStorageMode,
        uploadSubdir: updated.uploadSubdir,
      },
    });
    return { property: serializePropertyStorage(updated) };
  });

  app.post("/admin/storage/validate", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const payload = adminStoragePathSchema.parse(request.body);
    const validation = validateHostUploadPath(payload.hostPath);
    await writeAuditLog({
      request,
      actorUserId: request.currentUser!.id,
      entityType: "SYSTEM",
      action: "UPLOAD_STORAGE_PATH_VALIDATED",
      message: `Validated proposed upload storage path ${validation.normalizedPath}`,
      metadata: {
        safe: validation.safe,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    });

    return {
      ...validation,
      commands: validation.safe ? storageCommands(validation.normalizedPath) : null,
    };
  });

  app.post("/admin/users", async (request, reply) => {
    if (!(await ensureAdmin(request, reply))) {
      return;
    }

    const actor = request.currentUser!;
    const payload = adminCreateUserSchema.parse(request.body);
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
    const payload = adminUpdateUserSchema.parse(request.body);
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
    const payload = adminResetPasswordSchema.parse(request.body);
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
    const payload = adminUpdatePropertyAccessSchema.parse(request.body);
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
