import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { authConfig } from "./config.js";
import { hashPassword } from "./password.js";

export const digestPasswordToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createPasswordLink(userId: string) {
  if (!authConfig.appUrl) throw new Error("APP_URL is required for password emails.");
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: {
    passwordResetHash: digestPasswordToken(token),
    passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  } });
  // Fragments are not sent to the web server or included in HTTP referrers.
  return `${authConfig.appUrl.replace(/\/$/, "")}/#password-reset=${token}`;
}

export async function redeemPasswordLink(token: string, password: string) {
  const digest = digestPasswordToken(token);
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { passwordResetHash: digest } });
    if (!user) return false;
    const result = await tx.user.updateMany({ where: {
      id: user.id, isActive: true, passwordResetHash: digest,
      passwordResetExpiresAt: { gt: new Date() },
    }, data: { passwordHash, passwordResetHash: null, passwordResetExpiresAt: null } });
    if (!result.count) return false;
    await tx.session.deleteMany({ where: { userId: user.id } });
    return true;
  });
}
