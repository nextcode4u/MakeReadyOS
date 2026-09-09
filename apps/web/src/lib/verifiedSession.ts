export type VerifiedSession = Readonly<{ userId: string | null; revision: number }>;
export const verifiedSessionEventName = "makereadyos:verified-session-changed";
let current: VerifiedSession = { userId: null, revision: 0 };

export function getVerifiedSession() { return current; }
export function isCurrentSession(snapshot: VerifiedSession) { return snapshot === current; }

function publish(userId: string | null) {
  current = { userId, revision: current.revision + 1 };
  if (typeof window !== "undefined") window.dispatchEvent(new Event(verifiedSessionEventName));
}

export function clearVerifiedSession() { publish(null); }

export function acceptVerifiedSession(userId: string, startedWith: VerifiedSession) {
  if (!isCurrentSession(startedWith) || typeof userId !== "string" || !userId.trim()) return false;
  if (current.userId !== userId) publish(userId);
  return true;
}

export function requireVerifiedUserId() {
  if (!current.userId) throw new Error("Sign in before saving offline work.");
  return current.userId;
}
