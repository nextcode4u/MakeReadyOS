import type { Prisma } from "@prisma/client";

export async function lockProjectCategories(tx: Prisma.TransactionClient) {
  // Global categories have a null property ID, so the compound unique key is insufficient.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(824022, 1)::text`;
}
