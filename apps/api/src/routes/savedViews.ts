import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canManageSharedViews } from "../lib/auth.js";
import { writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

export const savedViewModuleQuerySchema = z.object({
  module: z.string().default("make-ready"),
  includeArchived: z.coerce.boolean().default(false),
});

export const savedViewSchema = z.object({
  name: z.string().trim().min(2).max(120),
  module: z.string().default("make-ready"),
  viewType: z.enum(["table", "kanban", "calendar", "dashboard"]),
  filters: z.record(z.unknown()).default({}),
  sorts: z.object({
    key: z.string(),
    direction: z.enum(["asc", "desc"]),
  }).nullable().optional(),
  grouping: z.record(z.unknown()).nullable().optional(),
  visibleColumns: z.array(z.string()).nullable().optional(),
  isShared: z.boolean().default(false),
});

export const savedViewUpdateSchema = savedViewSchema.partial().extend({
  name: z.string().trim().min(2).max(120).optional(),
  viewType: z.enum(["table", "kanban", "calendar", "dashboard"]).optional(),
});

function serializeSavedView(view: {
  id: string;
  ownerUserId: string | null;
  name: string;
  module: string;
  viewType: string;
  filters: unknown;
  sorts: unknown;
  grouping: unknown;
  visibleColumns: unknown;
  isShared: boolean;
  isDefault: boolean;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: view.id,
    ownerUserId: view.ownerUserId,
    name: view.name,
    module: view.module,
    viewType: view.viewType,
    filters: view.filters,
    sorts: view.sorts,
    grouping: view.grouping,
    visibleColumns: view.visibleColumns,
    isShared: view.isShared,
    isDefault: view.isDefault,
    isArchived: view.isArchived,
    archivedAt: view.archivedAt,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

function jsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function nullableJsonValue(value: unknown) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

async function findAuthorizedView(viewId: string, userId: string, isAdmin: boolean) {
  const view = await prisma.savedView.findUnique({
    where: { id: viewId },
  });

  if (!view) {
    return null;
  }

  if (isAdmin || view.ownerUserId === userId) {
    return view;
  }

  return null;
}

export async function savedViewRoutes(app: FastifyInstance) {
  app.get("/saved-views", async (request) => {
    const user = request.currentUser!;
    const query = savedViewModuleQuerySchema.parse(request.query);

    const views = await prisma.savedView.findMany({
      where: {
        module: query.module,
        ...(query.includeArchived ? {} : { isArchived: false }),
        OR: [
          { ownerUserId: user.id },
          { isShared: true },
        ],
      },
      orderBy: [
        { isDefault: "desc" },
        { isShared: "desc" },
        { name: "asc" },
      ],
    });

    return {
      views: views.map(serializeSavedView),
    };
  });

  app.post("/saved-views", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role === "VIEWER") {
      reply.code(403);
      return { message: "Viewer role cannot create saved views" };
    }

    const payload = savedViewSchema.parse(request.body);
    if (payload.isShared && !canManageSharedViews(user)) {
      reply.code(403);
      return { message: "Only MANAGER or ADMIN can create shared views" };
    }

    const created = await prisma.savedView.create({
      data: {
        ownerUserId: user.id,
        name: payload.name,
        module: payload.module,
        viewType: payload.viewType,
        filters: jsonValue(payload.filters),
        sorts: nullableJsonValue(payload.sorts ?? null),
        grouping: nullableJsonValue(payload.grouping ?? null),
        visibleColumns: nullableJsonValue(payload.visibleColumns ?? null),
        isShared: payload.isShared,
      },
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "SAVED_VIEW",
      entityId: created.id,
      action: "SAVED_VIEW_CREATED",
      message: `Created saved view ${created.name}`,
      metadata: {
        isShared: created.isShared,
        viewType: created.viewType,
      },
    });

    reply.code(201);
    return {
      view: serializeSavedView(created),
    };
  });

  app.patch("/saved-views/:id", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role === "VIEWER") {
      reply.code(403);
      return { message: "Viewer role cannot update saved views" };
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const payload = savedViewUpdateSchema.parse(request.body);
    const existing = await findAuthorizedView(params.id, user.id, user.role === "ADMIN");

    if (!existing) {
      reply.code(404);
      return { message: "Saved view not found" };
    }
    if (existing.isArchived) {
      reply.code(409);
      return { message: "Restore the saved view before editing it" };
    }

    const nextShared = payload.isShared ?? existing.isShared;
    if (nextShared && !canManageSharedViews(user)) {
      reply.code(403);
      return { message: "Only MANAGER or ADMIN can share saved views" };
    }

    const updated = await prisma.savedView.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        viewType: payload.viewType,
        filters: payload.filters === undefined ? undefined : jsonValue(payload.filters),
        sorts: payload.sorts === undefined ? undefined : nullableJsonValue(payload.sorts),
        grouping: payload.grouping === undefined ? undefined : nullableJsonValue(payload.grouping),
        visibleColumns: payload.visibleColumns === undefined ? undefined : nullableJsonValue(payload.visibleColumns),
        isShared: payload.isShared,
      },
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "SAVED_VIEW",
      entityId: updated.id,
      action: "SAVED_VIEW_UPDATED",
      message: `Updated saved view ${updated.name}`,
      metadata: {
        isShared: updated.isShared,
        viewType: updated.viewType,
      },
    });

    return {
      view: serializeSavedView(updated),
    };
  });

  app.post("/saved-views/:id/archive", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role === "VIEWER") {
      reply.code(403);
      return { message: "Viewer role cannot archive saved views" };
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await findAuthorizedView(params.id, user.id, user.role === "ADMIN");

    if (!existing) {
      reply.code(404);
      return { message: "Saved view not found" };
    }
    if (existing.isArchived) {
      return { ok: true };
    }

    const archivedAt = new Date();
    const archived = await prisma.savedView.update({
      where: { id: existing.id },
      data: {
        isArchived: true,
        archivedAt,
      },
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "SAVED_VIEW",
      entityId: archived.id,
      action: "SAVED_VIEW_ARCHIVED",
      message: `Archived saved view ${archived.name}`,
      metadata: {
        isShared: archived.isShared,
        archivedAt: archivedAt.toISOString(),
      },
    });

    return {
      ok: true,
      view: serializeSavedView(archived),
    };
  });

  app.post("/saved-views/:id/restore", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role === "VIEWER") {
      reply.code(403);
      return { message: "Viewer role cannot restore saved views" };
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await findAuthorizedView(params.id, user.id, user.role === "ADMIN");

    if (!existing) {
      reply.code(404);
      return { message: "Saved view not found" };
    }
    if (!existing.isArchived) {
      return { ok: true };
    }

    const restored = await prisma.savedView.update({
      where: { id: existing.id },
      data: {
        isArchived: false,
        archivedAt: null,
      },
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "SAVED_VIEW",
      entityId: restored.id,
      action: "SAVED_VIEW_RESTORED",
      message: `Restored saved view ${restored.name}`,
      metadata: {
        isShared: restored.isShared,
      },
    });

    return {
      ok: true,
      view: serializeSavedView(restored),
    };
  });

  app.delete("/saved-views/:id", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role === "VIEWER") {
      reply.code(403);
      return { message: "Viewer role cannot delete saved views" };
    }

    const params = z.object({ id: z.string() }).parse(request.params);
    const existing = await findAuthorizedView(params.id, user.id, user.role === "ADMIN");

    if (!existing) {
      reply.code(404);
      return { message: "Saved view not found" };
    }
    if (!existing.isArchived) {
      reply.code(409);
      return { message: "Archive the saved view before deleting it permanently" };
    }

    await prisma.savedView.delete({
      where: { id: existing.id },
    });

    await writeAuditLog({
      request,
      actorUserId: user.id,
      entityType: "SAVED_VIEW",
      entityId: existing.id,
      action: "SAVED_VIEW_DELETED",
      message: `Deleted saved view ${existing.name}`,
      metadata: {
        isShared: existing.isShared,
      },
    });

    return { ok: true };
  });
}
