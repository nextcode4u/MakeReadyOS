import { UserRole, type Prisma } from "@prisma/client";
import { createNotification } from "./notifications.js";

export const pondMilestones = [
  { goal: 1, name: "First team finish" },
  { goal: 5, name: "Growing together" },
  { goal: 10, name: "Pond crew" },
  { goal: 25, name: "Thriving pond" },
  { goal: 50, name: "Community builders" },
  { goal: 100, name: "A hundred homes" },
] as const;

// Called only after a real final-walk approval, in the same transaction as sign-off.
export async function recordPondCompletion(db: Prisma.TransactionClient, item: { id: string; propertyId: string }) {
  // Share the turn workflow's property lock so simultaneous approvals cannot skip a milestone.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${item.propertyId}), 824018)::text`;
  const inserted = await db.pondTurnCompletion.createMany({
    data: [{ itemId: item.id, propertyId: item.propertyId }], skipDuplicates: true,
  });
  if (!inserted.count) return;
  const total = await db.pondTurnCompletion.count({ where: { propertyId: item.propertyId } });
  const milestone = pondMilestones.find(entry => entry.goal === total);
  if (!milestone) return;
  const property = await db.property.findUniqueOrThrow({ where: { id: item.propertyId }, select: { name: true } });
  const users = await db.user.findMany({
    where: { isActive: true, OR: [
      { role: UserRole.ADMIN },
      { role: { in: [UserRole.MANAGER, UserRole.TECH, UserRole.PAINTER, UserRole.CLEANER, UserRole.LEASING] }, propertyAccess: { some: { propertyId: item.propertyId } } },
    ] },
    select: { id: true },
  });
  for (const user of users) await createNotification({
    userId: user.id, propertyId: item.propertyId, category: "POND_MILESTONE",
    title: `Team milestone: ${milestone.name}`,
    message: `${property.name}: ${total} ${total === 1 ? "turn" : "turns"} approved at final walk. Shared credit for technicians, painters, cleaners, and leasing. View your team's milestone in the Frog Pond.`,
    dedupeKey: `pond-milestone:${item.propertyId}:${milestone.goal}`,
  }, db);
}
