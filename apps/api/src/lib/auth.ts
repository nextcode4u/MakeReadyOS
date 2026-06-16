import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { User, UserPropertyAccess, UserRole } from "@prisma/client";
import { authConfig, deriveRequestOrigin, validateTrustedOrigin } from "./config.js";
import { prisma } from "./prisma.js";

export const AUTH_COOKIE_NAME = authConfig.sessionCookieName;
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
let lastExpiredSessionCleanupAt = 0;
const apiTokenRateLimitMax = Number(process.env.API_TOKEN_RATE_LIMIT_MAX || 300);
const apiTokenRateLimitWindowMs = Number(process.env.API_TOKEN_RATE_LIMIT_WINDOW_MINUTES || 15) * 60 * 1000;
let lastApiTokenRateLimitCleanupAt = 0;
const API_TOKEN_RATE_LIMIT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

type SessionUser = Pick<User, "id" | "email" | "fullName" | "role" | "language" | "isActive"> & {
  propertyAccess: Array<Pick<UserPropertyAccess, "propertyId" | "role">>;
};

type ApiTokenContext = {
  id: string;
  name: string;
  scopes: string[];
  propertyIds: string[] | null;
};

declare module "fastify" {
  interface FastifyRequest {
    currentUser: SessionUser | null;
    sessionId: string | null;
    csrfToken: string | null;
    apiToken: ApiTokenContext | null;
    authType: "session" | "apiToken" | null;
  }
}

export function sessionTtlMs() {
  return authConfig.sessionTtlDays * 24 * 60 * 60 * 1000;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getApiTokenRateLimitConfig() {
  return {
    max: apiTokenRateLimitMax,
    windowMinutes: Math.max(1, Math.round(apiTokenRateLimitWindowMs / 60000)),
    storage: "database-shared" as const,
  };
}

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function cleanupExpiredSessions(force = false) {
  const now = Date.now();
  if (!force && now - lastExpiredSessionCleanupAt < SESSION_CLEANUP_INTERVAL_MS) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(now),
      },
    },
  });
  lastExpiredSessionCleanupAt = now;
}

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: authConfig.sessionCookieSameSite,
    path: "/",
    ...(authConfig.sessionCookieDomain ? { domain: authConfig.sessionCookieDomain } : {}),
    secure: authConfig.secureCookies,
    signed: true,
    expires: expiresAt,
  } as const;
}

export async function createSessionForUser(options: {
  userId: string;
  reply: FastifyReply;
  userAgent?: string;
  ipAddress?: string;
}) {
  await cleanupExpiredSessions();

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const csrfToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  await prisma.session.create({
    data: {
      userId: options.userId,
      tokenHash,
      csrfToken,
      expiresAt,
      userAgent: options.userAgent,
      ipAddress: options.ipAddress,
    },
  });

  options.reply.setCookie(AUTH_COOKIE_NAME, token, sessionCookieOptions(expiresAt));

  return { csrfToken, expiresAt };
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply) {
  const cookie = request.cookies[AUTH_COOKIE_NAME];
  if (cookie) {
    const unsigned = request.unsignCookie(cookie);
    if (unsigned.valid) {
      await prisma.session.deleteMany({
        where: { tokenHash: hashSessionToken(unsigned.value) },
      });
    }
  }

  reply.clearCookie(AUTH_COOKIE_NAME, {
    path: "/",
    sameSite: authConfig.sessionCookieSameSite,
    ...(authConfig.sessionCookieDomain ? { domain: authConfig.sessionCookieDomain } : {}),
    secure: authConfig.secureCookies,
  });
}

export async function clearAllSessionsForUser(request: FastifyRequest, reply: FastifyReply) {
  if (request.currentUser) {
    await prisma.session.deleteMany({
      where: {
        userId: request.currentUser.id,
      },
    });
  }

  request.currentUser = null;
  request.sessionId = null;
  request.csrfToken = null;
  reply.clearCookie(AUTH_COOKIE_NAME, {
    path: "/",
    sameSite: authConfig.sessionCookieSameSite,
    ...(authConfig.sessionCookieDomain ? { domain: authConfig.sessionCookieDomain } : {}),
    secure: authConfig.secureCookies,
  });
}

export async function loadSessionUser(request: FastifyRequest) {
  await cleanupExpiredSessions();

  request.currentUser = null;
  request.sessionId = null;
  request.csrfToken = null;
  request.apiToken = null;
  request.authType = null;

  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const rawToken = authorization.slice("Bearer ".length).trim();
    if (!rawToken) return null;
    const tokenHash = hashApiToken(rawToken);
    const token = await prisma.apiToken.findUnique({
      where: { tokenHash },
      include: {
        createdBy: { include: { propertyAccess: true } },
        propertyScopes: true,
      },
    });
    if (!token || !token.isActive || token.revokedAt || !token.createdBy.isActive) return null;

    await prisma.apiToken.update({
      where: { id: token.id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
        lastUsedPath: request.routeOptions.url ?? request.url,
        lastUsedMethod: request.method,
      } as any,
    });

    request.authType = "apiToken";
    request.apiToken = {
      id: token.id,
      name: token.name,
      scopes: token.scopes,
      propertyIds: token.propertyScopes.length ? token.propertyScopes.map((scope) => scope.propertyId) : null,
    };
    request.currentUser = {
      id: token.createdBy.id,
      email: token.createdBy.email,
      fullName: token.createdBy.fullName,
      role: token.createdBy.role,
      language: token.createdBy.language,
      isActive: token.createdBy.isActive,
      propertyAccess: token.createdBy.propertyAccess.map((access) => ({
        propertyId: access.propertyId,
        role: access.role,
      })),
    };
    return request.currentUser;
  }

  const cookie = request.cookies[AUTH_COOKIE_NAME];

  if (!cookie) {
    return null;
  }

  const unsigned = request.unsignCookie(cookie);
  if (!unsigned.valid) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(unsigned.value) },
    include: {
      user: {
        include: {
          propertyAccess: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() < Date.now() || !session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  let csrfToken = session.csrfToken;
  if (!csrfToken) {
    csrfToken = generateSessionToken();
    await prisma.session.update({
      where: { id: session.id },
      data: {
        csrfToken,
      },
    });
  }

  await prisma.session.update({
    where: { id: session.id },
    data: {
      lastSeenAt: new Date(),
    },
  });

  request.sessionId = session.id;
  request.csrfToken = csrfToken;
  request.authType = "session";
  request.currentUser = {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    role: session.user.role,
    language: session.user.language,
    isActive: session.user.isActive,
    propertyAccess: session.user.propertyAccess.map((access) => ({
      propertyId: access.propertyId,
      role: access.role,
    })),
  };

  return request.currentUser;
}

export async function requireAuthenticated(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser ?? (await loadSessionUser(request));
  if (!user) {
    return reply.code(401).send({
      message: "Authentication required",
    });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser ?? (await loadSessionUser(request));
  if (!user) {
    return reply.code(401).send({
      message: "Authentication required",
    });
  }

  if (request.authType === "apiToken" || user.role !== "ADMIN") {
    return reply.code(403).send({
      message: "Admin access required",
    });
  }
}

export async function requireManagerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser ?? (await loadSessionUser(request));
  if (!user) {
    return reply.code(401).send({
      message: "Authentication required",
    });
  }

  if (request.authType === "apiToken" || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return reply.code(403).send({
      message: "Manager or admin access required",
    });
  }
}

export async function requireCsrf(request: FastifyRequest, reply: FastifyReply) {
  if (request.authType === "apiToken") {
    return;
  }
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return;
  }

  const origin = request.headers.origin;
  const requestOrigin = deriveRequestOrigin({
    host: request.headers.host,
    protocol: request.protocol,
    forwardedHost: typeof request.headers["x-forwarded-host"] === "string" ? request.headers["x-forwarded-host"] : undefined,
    forwardedProto: typeof request.headers["x-forwarded-proto"] === "string" ? request.headers["x-forwarded-proto"] : undefined,
  });
  if (!validateTrustedOrigin(origin, requestOrigin)) {
    return reply.code(403).send({
      message: "Origin not allowed",
    });
  }

  const csrfHeader = request.headers["x-csrf-token"];
  const expected = request.csrfToken;

  if (typeof csrfHeader !== "string" || !expected || csrfHeader !== expected) {
    return reply.code(403).send({
      message: "Invalid CSRF token",
    });
  }
}

export function requireRole(user: SessionUser, roles: UserRole[]) {
  return roles.includes(user.role);
}

export function allowedPropertyIds(user: SessionUser) {
  const sessionWideIds = user.role === "ADMIN" ? null : user.propertyAccess.map((access) => access.propertyId);
  return sessionWideIds;
}

export function scopedAllowedPropertyIds(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) return [];
  const base = allowedPropertyIds(user);
  const tokenIds = request.apiToken?.propertyIds ?? null;
  if (base === null && tokenIds === null) return null;
  if (base === null) return tokenIds ?? null;
  if (tokenIds === null) return base;
  return base.filter((propertyId) => tokenIds.includes(propertyId));
}

function safeStringEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export const apiTokenScopes = [
  "read:items",
  "write:items",
  "read:vendors",
  "write:vendors",
  "read:dashboard",
  "read:activity",
  "write:comments",
  "read:maps",
  "read:library",
  "write:library",
] as const;

export type ApiTokenScope = (typeof apiTokenScopes)[number];

function requiredScopeForRequest(request: FastifyRequest): ApiTokenScope | null {
  const method = request.method.toUpperCase();
  const rawUrl = request.url.split("?")[0] ?? request.url;
  const url = rawUrl.startsWith("/api/") ? rawUrl.slice("/api".length) : rawUrl;
  if (url.startsWith("/admin")) return null;
  if (url.startsWith("/make-ready-items/") && url.includes("/comments")) return method === "GET" ? "read:items" : "write:comments";
  if (url.startsWith("/make-ready-items/") && url.includes("/attachments")) return method === "GET" ? "read:items" : "write:comments";
  if (url.startsWith("/make-ready-items/") && url.includes("/collaboration")) return "read:items";
  if (url.startsWith("/make-ready-items")) return method === "GET" ? "read:items" : "write:items";
  if (url.startsWith("/dashboard")) return "read:dashboard";
  if (url.startsWith("/planning")) return method === "GET" ? "read:dashboard" : "write:items";
  if (url.startsWith("/analytics")) return method === "GET" ? "read:dashboard" : null;
  if (url.startsWith("/units/") && url.includes("/history")) return "read:items";
  if (url.startsWith("/activity")) return "read:activity";
  if (url.startsWith("/vendors") || url.startsWith("/vendor-assignments")) return method === "GET" ? "read:vendors" : "write:vendors";
  if (url.startsWith("/refrigerant")) return method === "GET" ? "read:items" : "write:items";
  if (url.startsWith("/pm")) return method === "GET" ? "read:items" : "write:items";
  if (url.startsWith("/property-wiki")) return method === "GET" ? "read:library" : "write:library";
  if (url.startsWith("/property-maps") || url.startsWith("/unit-map-locations")) return "read:maps";
  if (url.startsWith("/operational-library")) return method === "GET" ? "read:library" : "write:library";
  if (url.startsWith("/meta") || url.startsWith("/saved-views")) return "read:items";
  return null;
}

export async function requireApiTokenScope(request: FastifyRequest, reply: FastifyReply) {
  if (request.authType !== "apiToken") return;
  const required = requiredScopeForRequest(request);
  if (!required) {
    return reply.code(403).send({ message: "API token access is not allowed for this endpoint" });
  }
  if (!request.apiToken?.scopes.some((scope) => safeStringEquals(scope, required))) {
    return reply.code(403).send({ message: `API token requires scope ${required}` });
  }
}

export async function requireApiTokenRateLimit(request: FastifyRequest, reply: FastifyReply) {
  if (request.authType !== "apiToken" || !request.apiToken) return;
  if (!Number.isFinite(apiTokenRateLimitMax) || apiTokenRateLimitMax <= 0) return;
  const now = Date.now();
  const windowStartedAtMs = now - (now % apiTokenRateLimitWindowMs);
  const windowStartedAt = new Date(windowStartedAtMs);
  const bucket = await prisma.apiTokenRateLimitWindow.upsert({
    where: {
      apiTokenId_windowStartedAt: {
        apiTokenId: request.apiToken.id,
        windowStartedAt,
      },
    },
    create: {
      apiTokenId: request.apiToken.id,
      windowStartedAt,
      requestCount: 1,
    },
    update: {
      requestCount: { increment: 1 },
    },
    select: {
      requestCount: true,
    },
  });

  if (now - lastApiTokenRateLimitCleanupAt >= API_TOKEN_RATE_LIMIT_CLEANUP_INTERVAL_MS) {
    lastApiTokenRateLimitCleanupAt = now;
    void prisma.apiTokenRateLimitWindow.deleteMany({
      where: {
        windowStartedAt: {
          lt: new Date(now - (apiTokenRateLimitWindowMs * 2)),
        },
      },
    }).catch(() => {});
  }

  if (bucket.requestCount > apiTokenRateLimitMax) {
    const retryAfterSeconds = Math.max(1, Math.ceil(((windowStartedAtMs + apiTokenRateLimitWindowMs) - now) / 1000));
    reply.header("retry-after", String(retryAfterSeconds));
    return reply.code(429).send({ message: "API token rate limit exceeded" });
  }
}

export function canEditAnyBoardField(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "MANAGER";
}

export function canManageSharedViews(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "MANAGER";
}

export function canReadBoard(user: SessionUser) {
  return user.isActive;
}

export const rolePermissionMatrix = {
  ADMIN: {
    manageUsers: true,
    manageProperties: true,
    manageFields: true,
    manageAutomations: true,
    manageOperationalLibrary: true,
    batchBoardChanges: true,
    commentAndUpload: true,
    completeChecklists: true,
    viewDashboard: true,
    viewActivity: true,
    useMyWork: true,
  },
  MANAGER: {
    manageUsers: false,
    manageProperties: true,
    manageFields: true,
    manageAutomations: true,
    manageOperationalLibrary: true,
    batchBoardChanges: true,
    commentAndUpload: true,
    completeChecklists: true,
    viewDashboard: true,
    viewActivity: true,
    useMyWork: true,
  },
  TECH: {
    manageUsers: false,
    manageProperties: false,
    manageFields: false,
    manageAutomations: false,
    manageOperationalLibrary: false,
    batchBoardChanges: false,
    commentAndUpload: true,
    completeChecklists: true,
    viewDashboard: true,
    viewActivity: false,
    useMyWork: true,
  },
  LEASING: {
    manageUsers: false,
    manageProperties: false,
    manageFields: false,
    manageAutomations: false,
    manageOperationalLibrary: false,
    batchBoardChanges: false,
    commentAndUpload: true,
    completeChecklists: false,
    viewDashboard: true,
    viewActivity: false,
    useMyWork: true,
  },
  CLEANER: {
    manageUsers: false,
    manageProperties: false,
    manageFields: false,
    manageAutomations: false,
    manageOperationalLibrary: false,
    batchBoardChanges: false,
    commentAndUpload: true,
    completeChecklists: true,
    viewDashboard: true,
    viewActivity: false,
    useMyWork: true,
  },
  VIEWER: {
    manageUsers: false,
    manageProperties: false,
    manageFields: false,
    manageAutomations: false,
    manageOperationalLibrary: false,
    batchBoardChanges: false,
    commentAndUpload: false,
    completeChecklists: false,
    viewDashboard: true,
    viewActivity: false,
    useMyWork: false,
  },
} satisfies Record<UserRole, Record<string, boolean>>;

export const techEditableFields = new Set([
  "assignedTech",
  "completionStatus",
  "sheetrockStatus",
  "pestStatus",
  "pestTreated",
  "trashOutStatus",
  "floorsStatus",
  "flooringDate",
  "makeReadyStatus",
  "cleaningStatus",
  "keysMadeStatus",
  "cabinetsStatus",
  "countertopsStatus",
  "appliancesStatus",
  "paintStatus",
  "doorsStatus",
  "notes",
]);

export const leasingEditableFields = new Set([
  "applicant",
  "status",
  "vacancyStatus",
  "moveOutDate",
  "vacatedDate",
  "moveInDate",
  "daysUntilMoveIn",
  "notes",
]);

export const cleanerEditableFields = new Set([
  "assignedTech",
  "completionStatus",
  "cleaningStatus",
  "makeReadyStatus",
  "notes",
]);

const editableFieldsByRole: Partial<Record<UserRole, Set<string>>> = {
  TECH: techEditableFields,
  LEASING: leasingEditableFields,
  CLEANER: cleanerEditableFields,
};

export const assignableStaffRoles: UserRole[] = ["ADMIN", "MANAGER", "TECH", "CLEANER"];

export function canManageOperationalLibrary(user: SessionUser) {
  return rolePermissionMatrix[user.role].manageOperationalLibrary;
}

export function canWriteOperations(user: SessionUser) {
  return rolePermissionMatrix[user.role].commentAndUpload;
}

export function canCompleteChecklist(user: SessionUser) {
  return rolePermissionMatrix[user.role].completeChecklists;
}

export function canUpdateMakeReadyField(user: SessionUser, fieldKey: string) {
  if (canEditAnyBoardField(user)) return true;
  return Boolean(editableFieldsByRole[user.role]?.has(fieldKey));
}

export function sanitizeUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    language: user.language,
    propertyAccess: user.propertyAccess,
  };
}

export function clientIpAddress(request: FastifyRequest) {
  const forwarded = request.headers["x-forwarded-for"];
  if (authConfig.trustProxy && typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || request.ip;
  }

  return request.ip;
}
