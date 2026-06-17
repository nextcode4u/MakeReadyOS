import apiPackage from "../../package.json" with { type: "json" };
import { UserRole } from "@prisma/client";
import { allowedPropertyIds, assignableStaffRoles } from "../lib/auth.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { authConfig } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";

type LatestReleaseInfo = {
  tag: string;
  version: string;
  publishedAt: string | null;
  url: string | null;
  updateAvailable: boolean;
};

let latestReleaseCache: { expiresAt: number; repository: string; version: string; value: LatestReleaseInfo | null } | null = null;

function normalizeVersion(value: string) {
  return value.trim().replace(/^[vV]/, "");
}

function currentOrigin(request: FastifyRequest) {
  const explicitOrigin = request.headers.origin;
  if (typeof explicitOrigin === "string" && explicitOrigin.trim()) {
    return explicitOrigin.trim();
  }
  const forwardedHost = typeof request.headers["x-forwarded-host"] === "string"
    ? request.headers["x-forwarded-host"].split(",")[0]?.trim()
    : null;
  const forwardedProto = typeof request.headers["x-forwarded-proto"] === "string"
    ? request.headers["x-forwarded-proto"].split(",")[0]?.trim()
    : null;
  const host = authConfig.trustProxy && forwardedHost ? forwardedHost : request.headers.host;
  const proto = authConfig.trustProxy && forwardedProto ? forwardedProto : request.protocol;
  return host ? `${proto || (authConfig.secureCookies ? "https" : "http")}://${host}` : null;
}

async function getLatestReleaseInfo(currentVersion: string): Promise<LatestReleaseInfo | null> {
  if ((process.env.APP_UPDATE_RELEASES_ENABLED ?? "true").toLowerCase() === "false") {
    return null;
  }

  const repository = process.env.APP_UPDATE_REPO ?? "nextcode4u/MakeReadyOS";
  if (!repository.includes("/")) {
    return null;
  }

  if (
    latestReleaseCache
    && latestReleaseCache.repository === repository
    && latestReleaseCache.version === currentVersion
    && latestReleaseCache.expiresAt > Date.now()
  ) {
    return latestReleaseCache.value;
  }

  let value: LatestReleaseInfo | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `MakeReadyOS/${currentVersion}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const body = await response.json() as { tag_name?: string; html_url?: string; published_at?: string };
      const tag = body.tag_name?.trim();
      const version = normalizeVersion(tag ?? "");
      if (tag && version) {
        value = {
          tag,
          version,
          publishedAt: body.published_at ?? null,
          url: body.html_url ?? null,
          updateAvailable: version !== normalizeVersion(currentVersion),
        };
      }
    }
  } catch {
    value = null;
  }

  latestReleaseCache = {
    expiresAt: Date.now() + 1000 * 60 * 15,
    repository,
    version: currentVersion,
    value,
  };

  return value;
}

export async function metaRoutes(app: FastifyInstance) {
  app.get("/meta", async (request) => {
    const user = request.currentUser!;
    const currentVersion = apiPackage.version;
    const propertyIds = allowedPropertyIds(user);
    const propertyWhere = propertyIds === null ? { isActive: true } : { isActive: true, id: { in: propertyIds } };
    const latestRelease = await getLatestReleaseInfo(currentVersion);

    const [properties, labels, views, automations, units, customFields, staff, columns, scheduleTracks, boardSections] = await Promise.all([
      prisma.property.findMany({
        where: propertyWhere,
        orderBy: { code: "asc" },
      }),
      prisma.labelDefinition.findMany({
        orderBy: [{ fieldKey: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.savedView.findMany({
        where: {
          module: "make-ready",
          OR: [
            { ownerUserId: user.id },
            { isShared: true },
          ],
        },
        orderBy: { name: "asc" },
      }),
      prisma.automationRule.findMany({
        orderBy: { name: "asc" },
      }),
      prisma.unit.findMany({
        where: propertyIds === null ? { isActive: true } : { isActive: true, propertyId: { in: propertyIds } },
        orderBy: [{ propertyId: "asc" }, { number: "asc" }],
        include: { property: true, floorPlanRecord: true },
      }),
      prisma.customField.findMany({
        where: { module: "make-ready", isArchived: false, deletedAt: null },
        include: {
          options: {
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: assignableStaffRoles },
        },
        select: { id: true, fullName: true, role: true },
        orderBy: [{ fullName: "asc" }, { role: "asc" }],
      }),
      prisma.boardColumnDefinition.findMany({ orderBy: { fieldKey: "asc" } }),
      prisma.scheduleTrack.findMany({
        where: { isEnabled: true, isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      }),
      prisma.boardSection.findMany({
        where: { propertyId: propertyIds === null ? undefined : { in: propertyIds }, isActive: true },
        include: { property: true },
        orderBy: [{ propertyId: "asc" }, { sortOrder: "asc" }],
      }),
    ]);

    return {
      properties,
      labels,
      views,
      automations,
      units,
      customFields,
      staff,
      columns,
      scheduleTracks,
      boardSections,
      auth: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          propertyAccess: user.propertyAccess,
        },
      },
      app: {
        version: currentVersion,
        releaseChannel: process.env.APP_RELEASE_CHANNEL ?? "main",
        buildRef: process.env.APP_BUILD_REF ?? null,
        buildDate: process.env.APP_BUILD_DATE ?? null,
        updateCommand: "./update.sh --yes",
        updatePullCommand: "./update.sh --pull --yes",
        deploymentDocsPath: "docs/DEPLOYMENT.md",
        latestRelease,
        deployment: {
          appUrl: authConfig.appUrl,
          allowedOrigins: authConfig.corsOrigins,
          extraAllowedOrigins: authConfig.extraAllowedOrigins,
          trustedOrigins: authConfig.corsOrigins,
          trustedProxy: authConfig.trustProxy,
          secureCookies: authConfig.secureCookies,
          cookieDomain: authConfig.sessionCookieDomain,
          environment: authConfig.nodeEnv,
          selfHosted: authConfig.selfHosted,
          currentOrigin: currentOrigin(request),
          startupWarnings: authConfig.startupWarnings,
        },
      },
      boardGroups: boardSections.length > 0 ? boardSections.map((section) => section.key) : [
        "READY_UNITS_TA",
        "MAKE_READY_BOARD_TA",
        "DOWN_AND_MODELS",
        "READY_UNITS_VAB",
        "MAKE_READY_BOARD_VAB",
        "ARCHIVE_TA",
        "ARCHIVE_VAB",
      ],
    };
  });
}
