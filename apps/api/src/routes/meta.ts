import { UserRole } from "@prisma/client";
import { allowedPropertyIds, assignableStaffRoles } from "../lib/auth.js";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function metaRoutes(app: FastifyInstance) {
  app.get("/meta", async (request) => {
    const user = request.currentUser!;
    const propertyIds = allowedPropertyIds(user);
    const propertyWhere = propertyIds === null ? { isActive: true } : { isActive: true, id: { in: propertyIds } };

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
        where: { module: "make-ready", isArchived: false },
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
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          propertyAccess: user.propertyAccess,
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
