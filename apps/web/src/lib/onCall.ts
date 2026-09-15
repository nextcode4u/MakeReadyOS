import { apiBaseUrl } from "./api";

export type OnCallPerson = { id: string; name: string; publicPhone: string };
export type OnCallMarker = { kind: "SHOP" | "OFFICE"; x: number; y: number; page: number };
export type OnCallProperty = { id: string; name: string; address: string; shopLocation: string; accessCodes: string; instructions: string; mapUrl: string; guideUrl: string; mapFile?: { id: string; name: string; mime: string; size: number } | null; markers?: OnCallMarker[] };
export const onCallMapUrl = (propertyId: string, external: boolean) => `${apiBaseUrl}/on-call/${external ? "share/" : ""}properties/${encodeURIComponent(propertyId)}/map`;
export type OnCallShift = { id: string; personId: string; backupId: string; propertyIds: string[]; start: string; end: string; notes: string };
export type OnCallRotation = { enabled: boolean; startDate: string; startPersonId?: string; weekday: number; at: string; personIds: string[]; propertyIds: string[] };
export type OnCallCoverageChange = { id: string; personId: string; start: string; end: string; reason: string };
export type OnCallData = { title: string; timeZone: string; people: OnCallPerson[]; properties: OnCallProperty[]; shifts: OnCallShift[]; rotation?: OnCallRotation | null; coverageChanges?: OnCallCoverageChange[] };
export type OnCallSchedule = { shifts: OnCallShift[]; from: string; through: string };
export type OnCallState = { data: OnCallData; schedule?: OnCallSchedule; version: number; externalEnabled: boolean; hasAccessCode: boolean; canEdit: boolean; updatedAt: string | null; unlocked?: boolean; expiresAt?: number | null };
// Separate fetch path: a shared-code session is never accepted as an application login.
export async function sharedOnCall(path: "share" | "unlock" | "lock", code?: string): Promise<OnCallState> {
  const response = await fetch(`${apiBaseUrl}/on-call/${path}`, { credentials: "include", cache: "no-store", method: path === "share" ? "GET" : "POST", headers: path === "unlock" ? { "Content-Type": "application/json" } : { Accept: "application/json" }, ...(path === "unlock" ? { body: JSON.stringify({ code }) } : {}), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || "Could not load on-call"), { status: response.status });
  return result;
}
