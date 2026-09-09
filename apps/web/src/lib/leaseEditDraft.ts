import type { LeaseComplianceIssue } from "./api";

export const leaseEditFields = ["unitId", "building", "area", "status", "priority", "assignedUserId", "noticeStage"] as const;
export type LeaseEditValues = Partial<Pick<LeaseComplianceIssue, typeof leaseEditFields[number]>>;
export type LeaseEditDraft = { baseUpdatedAt: string; values: LeaseEditValues };
export const leaseEditDraftKey = (userId: string, propertyId: string, issueId: string) =>
  `makereadyos:lease-edit:${[userId, propertyId, issueId].map(encodeURIComponent).join(":")}`;
const choices: Record<string, string[]> = {
  status: ["Open", "Resident Notified", "Notice Sent", "Violation Needed", "Resolved", "Archived"],
  priority: ["Low", "Normal", "High", "Critical"],
  noticeStage: ["None", "Resident Notified", "1st Notice", "2nd Notice", "3rd Notice", "Violation Needed"],
};

export function encodeLeaseEditDraft(userId: string, propertyId: string, issueId: string, draft: LeaseEditDraft) {
  return JSON.stringify({ version: 1, userId, propertyId, issueId, draft });
}

export function parseLeaseEditDraft(raw: string | null, userId: string, propertyId: string, issueId: string): LeaseEditDraft | null {
  if (!raw || raw.length > 16000) return null;
  try {
    const envelope = JSON.parse(raw);
    if (envelope?.version !== 1 || envelope.userId !== userId || envelope.propertyId !== propertyId || envelope.issueId !== issueId) return null;
    const draft = envelope.draft;
    if (!draft || typeof draft.baseUpdatedAt !== "string" || !Number.isFinite(Date.parse(draft.baseUpdatedAt)) || !draft.values || typeof draft.values !== "object" || Array.isArray(draft.values)) return null;
    const entries = Object.entries(draft.values);
    if (!entries.length || entries.some(([key, value]) => {
      if (!leaseEditFields.includes(key as typeof leaseEditFields[number])) return true;
      if (choices[key]) return typeof value !== "string" || !choices[key].includes(value);
      return value !== null && (typeof value !== "string" || value.length > (key === "building" ? 120 : 160));
    })) return null;
    return { baseUpdatedAt: draft.baseUpdatedAt, values: { ...draft.values } };
  } catch { return null; }
}
