import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { authConfig, deriveRequestOrigin, validateTrustedOrigin } from "../lib/config.js";
import { clearAllSessionsForUser, clearSession, clientIpAddress, createSessionForUser, requireAuthenticated, requireCsrf, sanitizeUser } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  password: z.string().min(8),
});

const languageSchema = z.object({
  language: z.enum(["en", "es"]),
});

export async function authRoutes(app: FastifyInstance) {
  const rateLimitWindowMs = authConfig.loginRateLimitWindowMinutes * 60 * 1000;

  async function ensureLoginAllowed(request: FastifyRequest, identifier: string) {
    const ipAddress = clientIpAddress(request);
    const recentFailures = await prisma.auditLog.count({
      where: {
        entityType: "AUTH",
        action: {
          in: ["AUTH_LOGIN_FAILED", "AUTH_LOGIN_RATE_LIMITED"],
        },
        ipAddress,
        createdAt: {
          gte: new Date(Date.now() - rateLimitWindowMs),
        },
      },
    });

    if (recentFailures >= authConfig.loginRateLimitMax) {
      await writeAuditLog({
        request,
        entityType: "AUTH",
        action: "AUTH_LOGIN_RATE_LIMITED",
        message: `Rate limited login attempt for ${identifier}`,
        metadata: {
          identifier,
          windowMinutes: authConfig.loginRateLimitWindowMinutes,
          maxAttempts: authConfig.loginRateLimitMax,
        },
      });
      return false;
    }

    return true;
  }

  app.post("/login", async (request, reply) => {
    const requestOrigin = deriveRequestOrigin({
      host: request.headers.host,
      protocol: request.protocol,
      forwardedHost: typeof request.headers["x-forwarded-host"] === "string" ? request.headers["x-forwarded-host"] : undefined,
      forwardedProto: typeof request.headers["x-forwarded-proto"] === "string" ? request.headers["x-forwarded-proto"] : undefined,
    });
    if (!validateTrustedOrigin(request.headers.origin, requestOrigin)) {
      reply.code(403);
      return { message: "Origin not allowed" };
    }

    const payload = loginSchema.parse(request.body);
    const identifier = payload.identifier.trim().toLowerCase();

    if (!(await ensureLoginAllowed(request, identifier))) {
      reply.code(429);
      return { message: "Too many failed login attempts. Try again later." };
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
        ],
      },
      include: { propertyAccess: true },
    });

    if (!user || !user.isActive) {
      await writeAuditLog({
        request,
        entityType: "AUTH",
        action: "AUTH_LOGIN_FAILED",
        message: `Failed login attempt for ${identifier}`,
        metadata: {
          identifier,
          reason: "user_not_found_or_inactive",
        },
      });
      reply.code(401);
      return { message: "Invalid credentials" };
    }

    const valid = await verifyPassword(payload.password, user.passwordHash);
    if (!valid) {
      await writeAuditLog({
        request,
        actorUserId: user.id,
        entityType: "AUTH",
        action: "AUTH_LOGIN_FAILED",
        message: `Failed login attempt for ${identifier}`,
        metadata: {
          identifier,
          reason: "invalid_password",
        },
      });
      reply.code(401);
      return { message: "Invalid credentials" };
    }

    const session = await createSessionForUser({
      userId: user.id,
      reply,
      userAgent: request.headers["user-agent"],
      ipAddress: clientIpAddress(request),
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "AUTH",
      action: "AUTH_LOGIN_SUCCESS",
      message: `User ${user.username} logged in`,
      metadata: {
        role: user.role,
        identifier,
      },
    });

    return {
      user: sanitizeUser({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        language: user.language,
        isActive: user.isActive,
        propertyAccess: user.propertyAccess.map((access) => ({
          propertyId: access.propertyId,
          role: access.role,
        })),
      }),
      csrfToken: session.csrfToken,
      roles: Object.values(UserRole),
    };
  });

  app.post("/logout", async (request, reply) => {
    if (await requireAuthenticated(request, reply)) {
      return;
    }
    if (await requireCsrf(request, reply)) {
      return;
    }

    const currentUser = request.currentUser;
    await clearSession(request, reply);

    if (currentUser) {
      await writeAuditLog({
        request,
        actorUserId: currentUser.id,
        entityType: "AUTH",
        action: "AUTH_LOGOUT",
        message: `User ${currentUser.username} logged out`,
      });
    }

    return { ok: true };
  });

  app.post("/logout-all", async (request, reply) => {
    if (await requireAuthenticated(request, reply)) {
      return;
    }
    if (await requireCsrf(request, reply)) {
      return;
    }

    const currentUser = request.currentUser!;
    await clearAllSessionsForUser(request, reply);

    await writeAuditLog({
      request,
      actorUserId: currentUser.id,
      entityType: "AUTH",
      action: "AUTH_LOGOUT_ALL",
      message: `User ${currentUser.username} logged out all sessions`,
    });

    return { ok: true };
  });

  app.get("/me", async (request, reply) => {
    if (!request.currentUser) {
      reply.code(401);
      return { message: "Not authenticated" };
    }

    return {
      user: sanitizeUser(request.currentUser),
      csrfToken: request.csrfToken,
      roles: Object.values(UserRole),
    };
  });

  app.patch("/me/preferences", async (request, reply) => {
    if (await requireAuthenticated(request, reply)) {
      return;
    }
    if (await requireCsrf(request, reply)) {
      return;
    }

    const payload = languageSchema.parse(request.body);
    const currentUser = request.currentUser!;
    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: { language: payload.language },
      include: { propertyAccess: true },
    });

    await writeAuditLog({
      request,
      actorUserId: currentUser.id,
      entityType: "USER",
      entityId: currentUser.id,
      action: "USER_LANGUAGE_UPDATED",
      message: `Updated language preference for ${updated.username}`,
      metadata: { language: updated.language },
    });

    return {
      user: sanitizeUser({
        id: updated.id,
        username: updated.username,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        language: updated.language,
        isActive: updated.isActive,
        propertyAccess: updated.propertyAccess.map((access) => ({
          propertyId: access.propertyId,
          role: access.role,
        })),
      }),
    };
  });
}
