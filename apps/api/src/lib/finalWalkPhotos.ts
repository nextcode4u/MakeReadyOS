import type { Prisma, PrismaClient } from "@prisma/client";

export async function validateFollowUpPhotos(db: Pick<PrismaClient | Prisma.TransactionClient, "itemAttachment">, itemId: string, ids: string[]) {
  if (!ids.length) return;
  const count = await db.itemAttachment.count({ where: { itemId, id: { in: ids }, mimeType: { in: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] } } });
  if (count !== ids.length) throw Object.assign(new Error("Follow-up photos must be existing images attached to this unit. Remove unavailable photos before saving."), { statusCode: 400 });
}
