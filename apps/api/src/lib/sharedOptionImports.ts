import { prisma } from "./prisma.js";

export async function assertSharedOptionImportsAllowed(role: string, options: Array<{ fieldKey: string; value: string }>) {
  if (role === "ADMIN" || !options.length) return;
  const existing = await prisma.labelDefinition.findMany({
    where: { OR: options.map(({ fieldKey, value }) => ({ fieldKey, value })) },
    select: { fieldKey: true, value: true },
  });
  const key = (option: { fieldKey: string; value: string }) => JSON.stringify([option.fieldKey, option.value]);
  const known = new Set(existing.map(key));
  if (options.some(option => !known.has(key(option)))) {
    throw Object.assign(new Error("This import adds shared status definitions. Ask an admin to install them first; managers can reuse existing statuses."), { statusCode: 403 });
  }
}
