import type { FastifyInstance, FastifyRequest } from "fastify";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { authConfig, validateTrustedOrigin } from "../lib/config.js";
import { clearAllSessionsForUser, clearSession, clientIpAddress, createSessionForUser, requireAuthenticated, requireCsrf, sanitizeUser } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function authRoutes(app: FastifyInstance) {
  const rateLimitWindowMs = authConfig.loginRateLimitWindowMinutes * 60 * 1000;

  async function ensureLoginAllowed(request: FastifyRequest, email: string) {
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
        message: `Rate limited login attempt for ${email}`,
        metadata: {
          email,
          windowMinutes: authConfig.loginRateLimitWindowMinutes,
          maxAttempts: authConfig.loginRateLimitMax,
        },
      });
      return false;
    }

    return true;
  }

  app.post("/login", async (request, reply) => {
    if (!validateTrustedOrigin(request.headers.origin)) {
      reply.code(403);
      return { message: "Origin not allowed" };
    }

    const payload = loginSchema.parse(request.body);
    const email = payload.email.toLowerCase();

    if (!(await ensureLoginAllowed(request, email))) {
      reply.code(429);
      return { message: "Too many failed login attempts. Try again later." };
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { propertyAccess: true },
    });

    if (!user || !user.isActive) {
      await writeAuditLog({
        request,
        entityType: "AUTH",
        action: "AUTH_LOGIN_FAILED",
        message: `Failed login attempt for ${email}`,
        metadata: {
          email,
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
        message: `Failed login attempt for ${email}`,
        metadata: {
          email,
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
      message: `User ${user.email} logged in`,
      metadata: {
        role: user.role,
      },
    });

    return {
      user: sanitizeUser({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
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
        message: `User ${currentUser.email} logged out`,
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
      message: `User ${currentUser.email} logged out all sessions`,
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
}
