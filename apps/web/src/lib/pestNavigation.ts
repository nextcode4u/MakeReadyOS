export const openPestQuickAddEventName = "makereadyos:open-pest-quick-add";
export const openPestWorkspaceEventName = "makereadyos:open-pest-workspace";

export type OpenPestQuickAddRequest = {
  propertyId: string;
  unitId?: string;
  makeReadyItemId?: string;
  area?: string;
  pestType?: string;
  additionalPestType?: string;
  source?: string;
  priority?: string;
  description?: string;
};

export type OpenPestWorkspaceRequest = {
  propertyId: string;
  tab?: "dashboard" | "active" | "make-ready" | "vendors" | "archive" | "reports";
  makeReadyItemId?: string;
  search?: string;
};

export function openPestQuickAdd(request: OpenPestQuickAddRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(openPestQuickAddEventName, { detail: request }));
}

export function openPestWorkspace(request: OpenPestWorkspaceRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(openPestWorkspaceEventName, { detail: request }));
}
