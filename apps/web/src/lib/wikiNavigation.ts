import type { PropertyWikiTargetType } from "./api";

export const openWikiRecordEventName = "makereadyos:open-wiki-record";

export type OpenWikiRecordRequest = {
  targetType: PropertyWikiTargetType;
  id: string;
  propertyId?: string;
};

export function openWikiRecord(request: OpenWikiRecordRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(openWikiRecordEventName, { detail: request }));
}
