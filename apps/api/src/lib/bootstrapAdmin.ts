import { UserRole, type PrismaClient } from "@prisma/client";
import { hashPassword } from "./password.js";

export async function ensureBootstrapAdmin(db: Pick<PrismaClient, "user">, input: { username: string; email: string | null; password: string }) {
  const existing = await db.user.findFirst({ where: { OR: [
    { username: input.username },
    ...(input.email ? [{ email: input.email }] : []),
  ] } });
  // Bootstrap settings create the first account; they must not undo later account edits.
  if (existing) return existing.id;
  const created = await db.user.create({ data: {
    username: input.username, email: input.email,
    passwordHash: await hashPassword(input.password),
    fullName: "Default Admin", role: UserRole.ADMIN,
  } });
  return created.id;
}
