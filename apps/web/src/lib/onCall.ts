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
export type OnCallState = { data: OnCallData; schedule?: OnCallSchedule; version: number; externalEnabled: boolean; hasAccessCode: boolean; hasEditCode?: boolean; canEdit: boolean; updatedAt: string | null; unlocked?: boolean; expiresAt?: number | null; editExpiresAt?: number | null };
// Separate fetch path: a shared-code session is never accepted as an application login.
export async function sharedOnCall(path: "share" | "unlock" | "unlock-edit" | "lock", code?: string): Promise<OnCallState> {
  const unlock = path === "unlock" || path === "unlock-edit";
  const response = await fetch(`${apiBaseUrl}/on-call/${path}`, { credentials: "include", cache: "no-store", method: path === "share" ? "GET" : "POST", headers: unlock ? { "Content-Type": "application/json" } : { Accept: "application/json" }, ...(unlock ? { body: JSON.stringify({ code }) } : {}), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || "Could not load on-call"), { status: response.status });
  return result;
}
export async function saveSharedOnCall(version: number, data: OnCallData): Promise<OnCallState> {
  const response = await fetch(`${apiBaseUrl}/on-call/share`, { method: "PUT", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, data }), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || "Could not save on-call"), { status: response.status });
  return result;
}
export async function uploadSharedOnCallMap(propertyId: string, version: number, file: File) {
  const body = new FormData(); body.append("file", file);
  const response = await fetch(`${onCallMapUrl(propertyId, true)}?version=${version}`, { method: "POST", credentials: "include", cache: "no-store", body, signal: AbortSignal.timeout(60000) });
  if (!response.ok) { const result = await response.json(); throw Object.assign(new Error(result.message || "Could not upload map"), { status: response.status }); }
}
