import { normalizeOccupancy } from "./availabilityStatus";
import { joinDelimitedLine } from "./delimitedRows";

export function xmlElementName(node: Element | null | undefined) {
  return node?.localName?.toLowerCase() ?? node?.nodeName?.replace(/^.*:/, "").toLowerCase() ?? "";
}

export function xmlAttributeValue(node: Element, name: string) {
  const normalized = name.toLowerCase();
  for (const attribute of Array.from(node.attributes)) {
    const attributeName = attribute.localName?.toLowerCase() ?? attribute.name.replace(/^.*:/, "").toLowerCase();
    if (attributeName === normalized) return attribute.value;
  }
  return "";
}

export function xmlChildText(node: Element, name: string) {
  const normalized = name.toLowerCase();
  for (const child of Array.from(node.children)) {
    if (xmlElementName(child) === normalized) return child.textContent?.trim() ?? "";
  }
  return "";
}

export function normalizeXmlSpreadsheetDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s.*)?$/);
  if (slash) return `${slash[3].length === 2 ? "20" + slash[3] : slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  return trimmed.slice(0, 10);
}

export function cleanXmlReportValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /^(n\/a|na|none|null|no data|\(blank\)|blank|-|—)$/i.test(trimmed)) return "";
  return trimmed;
}

export function convertAvailabilityXmlToCsv(input: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(input, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid XML. Upload the original RealPage availability XML export.");
  const leaseVariance = Array.from(document.getElementsByTagName("*")).find((node) => xmlElementName(node) === "leasevariance");
  if (!leaseVariance) throw new Error("Unsupported XML report. Choose a RealPage availability report, not a unit directory or another report.");
  const settingsRow = Array.from(document.getElementsByTagName("*")).find((node) => xmlElementName(node) === "settings");
  const settingsRecord = settingsRow ? Array.from(settingsRow.children).find(node => xmlElementName(node) === "row") : undefined;
  const reportDate = normalizeXmlSpreadsheetDate(
    settingsRecord ? (xmlAttributeValue(settingsRecord, "PropertyDate") || xmlAttributeValue(settingsRecord, "RunDate")) : "",
  );
  const rows = Array.from(leaseVariance.children).filter((node) => xmlElementName(node) === "row");
  const header = ["unit", "floorPlan", "sqft", "availabilityStatus", "vacancyStatus", "moveOutDate", "vacatedDate", "daysVacant", "makeReadyDate", "moveInDate", "applicant", "reportDate", "dateApplied", "building", "area", "floor", "currentResidentName", "currentResidentMoveInDate"];
  const csvRows = rows.flatMap((row) => {
    const sectionType = xmlChildText(row, "SectionType").toUpperCase();
    const unit = cleanXmlReportValue(xmlChildText(row, "UnitNumber_Display") || xmlChildText(row, "UnitNumber"));
    const status = cleanXmlReportValue(xmlChildText(row, "Status"));
    if (sectionType !== "DETAIL") return [];
    if (!unit || !status) throw new Error("A RealPage detail row is missing its unit or status. Import stopped to avoid skipping units.");
    const normalizedStatus = normalizeOccupancy(status);
    if (normalizedStatus === "UNKNOWN") throw new Error("A RealPage detail row has an unsupported availability status. Import stopped for review.");
    const rawMoveOut = normalizeXmlSpreadsheetDate(xmlChildText(row, "MoveOut"));
    const rawMoveIn = normalizeXmlSpreadsheetDate(xmlChildText(row, "MoveIn"));
    const makeReady = normalizeXmlSpreadsheetDate(xmlChildText(row, "MakeReady"));
    const dateApplied = normalizeXmlSpreadsheetDate(xmlChildText(row, "Applied"));
    const building = cleanXmlReportValue(xmlChildText(row, "bldgNumber"));
    const floor = cleanXmlReportValue(xmlChildText(row, "UnitFloorNumber"));
    const billingName = cleanXmlReportValue(xmlChildText(row, "reshBillingName"));
    const pendingResident = /^Vacant - pending resident:\s*/i;
    const applicant = (cleanXmlReportValue(xmlChildText(row, "NewreshBillingName")) || (pendingResident.test(billingName) ? billingName : "")).replace(pendingResident, "");
    const currentResidentName = pendingResident.test(billingName) || /^vacant$/i.test(billingName) ? "" : billingName;
    const moveOutDate = normalizedStatus.includes("NTV") ? rawMoveOut : "";
    const vacatedDate = normalizedStatus.includes("VACANT") && !normalizedStatus.includes("NTV") ? rawMoveOut : "";
    return [[
      unit,
      cleanXmlReportValue(xmlChildText(row, "fpCode")),
      cleanXmlReportValue(xmlChildText(row, "unitRentSqFtCount")),
      status,
      normalizedStatus,
      moveOutDate,
      vacatedDate,
      cleanXmlReportValue(xmlChildText(row, "DaysVacant")),
      makeReady,
      rawMoveIn,
      applicant,
      reportDate || normalizeXmlSpreadsheetDate(xmlChildText(row, "PropertyDate")),
      dateApplied,
      building,
      "",
      floor,
      currentResidentName,
      normalizeXmlSpreadsheetDate(xmlChildText(row, "CurrentResidentMoveInDate") || xmlChildText(row, "ResidentMoveInDate")),
    ]];
  });
  if (!csvRows.length) throw new Error("This RealPage availability XML contains no detail rows. Nothing was imported.");
  return [header, ...csvRows].map(row => joinDelimitedLine(row, ",")).join("\n");
}

export async function readImportFile(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf16le = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0);
  const utf16be = (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c);
  return new TextDecoder(utf16le ? "utf-16le" : utf16be ? "utf-16be" : "utf-8", { fatal: true }).decode(bytes);
}
