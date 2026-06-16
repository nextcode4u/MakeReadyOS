import { UserRole } from "@prisma/client";
import { prisma } from "./prisma.js";

export const notificationCategories = [
  "ASSIGNMENT",
  "SCHEDULE",
  "MOVE_IN_SOON",
  "OVERDUE",
  "AUTOMATION_WARNING",
  "ITEM_LIFECYCLE",
  "BATCH_CHANGE",
  "STATUS_CHANGE",
  "COMMENT",
  "CHECKLIST",
  "RISK",
  "VENDOR",
  "PLANNING",
  "PM",
  "LEASE_COMPLIANCE",
] as const;

type NotificationCategory = (typeof notificationCategories)[number];

export async function assignedStaffUserId(assignedTech: string | null | undefined) {
  if (!assignedTech) return null;
  const user = await prisma.user.findFirst({
    where: {
      fullName: assignedTech,
      isActive: true,
      role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.TECH, UserRole.CLEANER] },
    },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function createNotification(input: {
  userId: string;
  propertyId?: string | null;
  itemId?: string | null;
  category: NotificationCategory;
  title: string;
  message: string;
  dedupeKey?: string | null;
}) {
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId_category: { userId: input.userId, category: input.category } },
  });
  if (preference && !preference.enabled) return null;

  const data = {
    userId: input.userId,
    propertyId: input.propertyId ?? null,
    itemId: input.itemId ?? null,
    category: input.category,
    title: input.title,
    message: input.message,
    dedupeKey: input.dedupeKey ?? null,
  };
  if (!input.dedupeKey) return prisma.notification.create({ data });
  return prisma.notification.upsert({
    where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
    create: data,
    update: { ...data, isRead: false, readAt: null, createdAt: new Date() },
  });
}

export async function notifyAssignedStaff(input: {
  assignedTech: string | null | undefined;
  propertyId: string;
  itemId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  dedupeKey?: string | null;
}) {
  const userId = await assignedStaffUserId(input.assignedTech);
  if (!userId) return null;
  return createNotification({ ...input, userId });
}

export async function notifyPropertyRoles(input: {
  propertyId: string;
  itemId?: string | null;
  roles: UserRole[];
  category: NotificationCategory;
  title: string;
  message: string;
  dedupeKey?: string | null;
}) {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: UserRole.ADMIN },
        {
          role: { in: input.roles.filter((role) => role !== UserRole.ADMIN) },
          propertyAccess: { some: { propertyId: input.propertyId } },
        },
      ],
    },
    select: { id: true },
  });
  return Promise.all(users.map((user) => createNotification({
    userId: user.id,
    propertyId: input.propertyId,
    itemId: input.itemId ?? null,
    category: input.category,
    title: input.title,
    message: input.message,
    dedupeKey: input.dedupeKey,
  })));
}
