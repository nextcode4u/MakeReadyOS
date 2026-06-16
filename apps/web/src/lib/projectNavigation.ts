export const openProjectRecordEventName = "makereadyos:open-project-record";
export const openProjectCreateEventName = "makereadyos:open-project-create";

export type OpenProjectRecordRequest = {
  id: string;
  propertyId?: string;
};

export type OpenProjectCreateRequest = {
  propertyId: string;
  recordType?: "Recommendation" | "Project";
  source?: string;
  title?: string;
  description?: string;
  sourceRecordType?: string;
  sourceRecordId?: string;
  sourceRecordLabel?: string;
  building?: string;
  area?: string;
  locationNotes?: string;
  tags?: string[];
};

export function openProjectRecord(request: OpenProjectRecordRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(openProjectRecordEventName, { detail: request }));
}

export function openProjectCreate(request: OpenProjectCreateRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(openProjectCreateEventName, { detail: request }));
}
