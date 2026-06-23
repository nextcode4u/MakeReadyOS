export const openLeaseQuickAddEventName = "makereadyos:open-lease-quick-add";
export const openLeaseWorkspaceEventName = "makereadyos:open-lease-workspace";

export type OpenLeaseQuickAddRequest = {
  propertyId: string;
  unitId?: string;
  building?: string;
  area?: string;
  issueTypeName?: string;
  priority?: string;
  source?: string;
  description?: string;
  locationNotes?: string;
  mapPin?: {
    mapId: string;
    xPercent: number;
    yPercent: number;
    sourceRecordType?: string;
    sourceRecordId?: string;
    sourceRecordLabel?: string;
  };
};

export type OpenLeaseWorkspaceRequest = {
  propertyId: string;
  tab?: "dashboard" | "active" | "grounds" | "needs-notice" | "violation" | "resolved" | "archive" | "reports" | "settings";
  search?: string;
};

export function openLeaseQuickAdd(request: OpenLeaseQuickAddRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(openLeaseQuickAddEventName, { detail: request }));
}

export function openLeaseWorkspace(request: OpenLeaseWorkspaceRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(openLeaseWorkspaceEventName, { detail: request }));
}
