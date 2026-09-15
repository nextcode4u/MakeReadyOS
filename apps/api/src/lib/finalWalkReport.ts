import { z } from "zod";

export const legacyReportSections = [
  { id: "general", title: "General preparation & HVAC", checks: ["Initial walk and condition photos recorded", "Previous belongings and debris removed", "Heating, cooling and thermostat checked", "Filter, vents and coils checked", "Fan motors and condensate drainage checked", "Water heater operation and leaks checked", "Doors/windows open, close and lock", "Weather seals and patio security checked", "Walls/floors and moisture concerns addressed", "Closet rods, shelves and brackets secure", "Patio/balcony and applicable rails checked", "Installed laundry and garage opener checked"] },
  { id: "kitchen", title: "Kitchen", checks: ["Range/oven and refrigerator checked", "Dishwasher fills, runs and drains", "Microwave/hood light and exhaust checked", "Sink, supplies and disposal checked", "Hot/cold water and faucet pressure checked", "Cabinets, drawers and appliance seals checked"] },
  { id: "bathrooms", title: "Bathrooms checked (all applicable rooms)", checks: ["Toilets, faucets and drains checked", "Tubs/showers, caulk, grout and rods checked", "Hot/cold water and pressure checked", "Under-sink cabinets and exhaust fans checked"] },
  { id: "bedrooms", title: "Living areas & bedrooms (all applicable rooms)", checks: ["Ceiling fans checked", "Window coverings and screens checked", "Closets, doors, floors, walls and trim checked"] },
  { id: "safety", title: "Safety & electrical - technical checks", checks: ["Outlet/switch condition and tests recorded", "Applicable GFCI tests recorded", "Smoke/CO alarm tests and service life checked", "Breaker labels and panel security checked", "Interior/exterior lights checked", "Applicable fire extinguisher checked", "Visible pest concerns addressed"] },
  { id: "review", title: "Independent final walk - presentation review", checks: ["Bedrooms and bathrooms visually rechecked", "Kitchen and appliance interiors clean", "Floors/carpets, trim and corners clean", "Paint/finishes reviewed; tape removed", "Entry/outdoor areas free of tools and debris", "Odors, trash and cans addressed", "Property-provided internet checked", "Valet trash container and lid checked", "Rekey/lock change completion reviewed", "Mailbox, keys, tags and remotes reviewed", "Reported deficiencies corrected/rechecked", "Move-in folder and handoff prepared", "Independent review and sign-offs reviewed"] },
] as const;
const checksFor = (sections: ReadonlyArray<{ id: string; title: string; checks: readonly string[] }>) => sections.flatMap(section => section.checks.map((label, index) => ({ id: `${section.id}-${index + 1}`, section: section.id, label })));
export const legacyReportChecks = checksFor(legacyReportSections);
export const technicianSections = [{ id: "tech-v2", title: "Technician preparation", checks: [
  "Initial condition photos and repair scope recorded; trash-out complete",
  "HVAC, thermostat, filter, coils and condensate drainage serviced/checked",
  "Plumbing, water heater, fixtures and drains checked for operation/leaks",
  "Kitchen appliances, disposal and installed laundry checked",
  "Doors, windows, locks and applicable patio/railings secure",
  "Lights, switches/outlets, GFCIs and smoke/CO alarms checked",
  "Floors, walls, cabinets, closets, fans and window coverings repaired as needed",
  "Pest concerns addressed; resident keys, fobs, remotes and codes prepared",
] }] as const;
export const technicianChecks = checksFor(technicianSections);
export const reportSections = [
  { id: "presentation-v2", title: "Final walk: freshness & presentation", checks: [
    "All rooms, bathrooms, kitchen/appliance interiors and floors clean and fresh",
    "AC/heating maintains the thermostat set temperature",
    "Paint and finishes present well; no visible damage or unfinished repairs",
    "Entry/outdoor areas tidy; no tools, debris or trash left behind",
    "Property-provided internet ready, if applicable",
    "Valet trash container and lid ready, if applicable",
  ] },
  { id: "handoff-v2", title: "Final walk: resident handoff", checks: [
    "Reported deficiencies resolved and visually rechecked",
    "Move-in folder and resident handoff information prepared",
    "Independent final presentation review complete; ready for sign-off",
  ] },
] as const;
export const reportChecks = checksFor(reportSections);
const text = (max: number) => z.string().trim().max(max);
export const reportSettingsSchema = z.object({
  title: text(80).min(1),
  introduction: text(240),
  footer: text(240),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();
export const defaultReportSettings = { title: "Your Home Preparation Checklist", introduction: "Recorded preparation checks and final presentation review for your home.", footer: "Please complete your move-in condition form and report concerns to the property team. This summary is not a safety certification or a guarantee of future performance.", accent: "#174d49" };
const resultSchema = z.object({ status: z.enum(["NOT_CHECKED", "CHECKED", "ATTENTION", "NA"]), note: text(100) }).strict();
export const reportDraftSchema = z.object({
  inspectionDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const d = new Date(`${value}T12:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value; }, "Enter a valid date")]),
  results: z.record(resultSchema).refine(results => Object.keys(results).every(id => [...reportChecks, ...legacyReportChecks].some(check => check.id === id)), "Unknown checklist entry").refine(results => Object.values(results).every(result => !["NA", "ATTENTION"].includes(result.status) || result.note.length > 0), "Add a reason for Not applicable or Needs attention"),
  technicianResults: z.record(resultSchema).refine(results => Object.keys(results).every(id => technicianChecks.some(check => check.id === id)), "Unknown technician check").refine(results => Object.values(results).every(result => !["NA", "ATTENTION"].includes(result.status) || result.note.length > 0), "Add a reason for technician exceptions").default({}),
  handoffConfirmed: z.boolean().default(false),
  gateCode: text(60).default(""), pedestrianCode: text(60).default(""),
  technicianFollowUp: text(1000).default(""), technicianResolution: text(1000).default(""), correctionPending: z.boolean().default(false),
  mailbox: text(40), homeKeys: text(20), mailboxKeys: text(20), fobs: text(20), remotes: text(20), parking: text(60),
  mailboxSource: z.enum(["DIRECTORY", "CUSTOM"]).optional(),
  residentDoorCode: text(60).default(""), residentAccessCode: text(60).default(""),
  includeResidentCodes: z.boolean().default(false),
  followUp: text(400),
}).strict();
export const emptyReportDraft = () => ({ inspectionDate: "", results: {} as Record<string, z.infer<typeof resultSchema>>, technicianResults: {} as Record<string, z.infer<typeof resultSchema>>, handoffConfirmed: false, gateCode: "", pedestrianCode: "", technicianFollowUp: "", technicianResolution: "", correctionPending: false, mailbox: "", mailboxSource: "DIRECTORY" as const, homeKeys: "", mailboxKeys: "", fobs: "", remotes: "", parking: "", followUp: "", residentDoorCode: "", residentAccessCode: "", includeResidentCodes: false });
export const savedReportSettingsSchema = z.object({ version: z.number().int().positive(), value: reportSettingsSchema });
export const savedReportDraftSchema = z.object({ version: z.number().int().positive(), value: reportDraftSchema, updatedAt: z.string().datetime() });
export type ReportSettings = z.infer<typeof reportSettingsSchema>;
export type ReportDraft = z.infer<typeof reportDraftSchema>;
export function residentReportBlockers(draft: ReportDraft) {
  return [
    ...(!draft.inspectionDate ? ["Record the inspection date."] : []),
    ...technicianChecks.filter(check => !["CHECKED", "NA"].includes(draft.technicianResults[check.id]?.status)).map(check => `Technician preparation: ${check.label}`),
    ...reportChecks.filter(check => !["CHECKED", "NA"].includes(draft.results[check.id]?.status)).map(check => `Final walk: ${check.label}`),
    ...(!draft.handoffConfirmed || [draft.homeKeys, draft.mailboxKeys, draft.fobs, draft.remotes].some(count => !/^\d{1,4}$/.test(count)) ? ["Confirm all key, fob and remote counts."] : []),
    ...(draft.correctionPending ? ["Resolve outstanding technician corrections."] : []),
  ];
}
export function resolveReportMailbox(draft: ReportDraft, directoryMailbox: string | null): ReportDraft {
  const mailboxSource = draft.mailboxSource ?? (draft.mailbox ? "CUSTOM" : "DIRECTORY");
  return { ...draft, mailboxSource, mailbox: mailboxSource === "DIRECTORY" ? directoryMailbox ?? "" : draft.mailbox };
}
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function finalWalkReportHtml(context: { propertyName: string; propertyCode: string; propertyLogo: string | null; companyName: string | null; companyLogo: string | null; unitNumber: string | null; technician: string | null; reviewer: string | null }, settings: ReportSettings, draft: ReportDraft, publication?: { exportedBy: string; exportedAt: string; revision: number }) {
  if (publication && residentReportBlockers(draft).length) throw new Error("Complete the saved inspection before exporting a resident report");
  // Logos come only from the validated branding store; never fetch remote resources.
  const logo = (value: string | null) => value && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? `<img alt="Logo" src="${escape(value)}">` : "";
  const labels = { NOT_CHECKED: "Not checked", CHECKED: "Checked", ATTENTION: "Attention", NA: "N/A" };
  const legacy = !reportChecks.some(check => draft.results[check.id]) && !Object.keys(draft.technicianResults).length && legacyReportChecks.some(check => draft.results[check.id]);
  const sections = legacy ? legacyReportSections : [...technicianSections, ...reportSections];
  const checks = legacy ? legacyReportChecks : [...technicianChecks, ...reportChecks];
  const sectionHtml = (section: { id: string; title: string }) => `<section><h2>${escape(section.title)}</h2>${checks.filter(check => check.section === section.id).map(check => {
    const result = (check.section === "tech-v2" ? draft.technicianResults : draft.results)[check.id] ?? { status: "NOT_CHECKED", note: "" };
    return `<div class="check"><span>${escape(check.label)}${result.note ? `<small>${escape(result.note)}</small>` : ""}</span><b class="${result.status}">${labels[result.status]}</b></div>`;
  }).join("")}</section>`;
  const details = [["Mailbox", draft.mailbox], ["Home / mailbox keys", `${draft.homeKeys || "Not recorded"} / ${draft.mailboxKeys || "Not recorded"}`], ["Fobs / remotes", `${draft.fobs || "Not recorded"} / ${draft.remotes || "Not recorded"}`], ["Parking / garage", draft.parking]];
  if (draft.includeResidentCodes) details.push(["Resident-only door code", draft.residentDoorCode], ["Resident-only access code", draft.residentAccessCode]);
  if (draft.includeResidentCodes) details.push(["Resident gate code", draft.gateCode], ["Resident pedestrian code", draft.pedestrianCode]);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${publication ? "Resident" : "Draft"} final-walk report</title><style>
  *{box-sizing:border-box}body{margin:0;background:white;color:#20323a;font:11px/1.25 Tahoma,sans-serif}main{border-top:5px solid ${settings.accent};padding:8px 0;overflow-wrap:anywhere}h1{font:25px/1.15 Georgia,serif;margin:8px 0;color:${settings.accent}}h2{font-size:11px;color:${settings.accent};border-bottom:2px solid ${settings.accent};padding-bottom:3px;margin:8px 0 3px}.draft{padding:5px;background:#fff3d8;border:1px solid #aa772e;font-size:10px;font-weight:bold}.brand{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-top:8px}.brand>div{display:flex;gap:10px;align-items:center;max-width:49%}.brand img{width:90px;height:48px;object-fit:contain}.brand strong{font-size:14px}.brand small{display:block}.identity,.handoff{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;border-block:1px solid #ccd7d8;padding:7px 0}.identity strong,.handoff strong{display:block}.columns{display:grid;grid-template-columns:1fr 1fr;gap:18px}.check{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;border-bottom:1px solid #e1e8e8;padding:1px 0;font-size:9px;line-height:1.3}.check b{font-size:8px}.check small{display:block;font-size:8px;color:#674e35}.CHECKED{color:#245849}.ATTENTION{color:#a32028}.NOT_CHECKED{color:#665d53}.handoff{grid-template-columns:repeat(4,minmax(0,1fr));font-size:9px;margin-top:8px}.note{font-size:9px;margin:6px 0}.signoffs{display:grid;grid-template-columns:1fr 1fr;gap:18px;font-size:9px;margin-top:8px}.signoffs>div{border-top:2px solid ${settings.accent};padding-top:5px}.signoffs strong{display:block}footer{border-top:1px solid #ccd7d8;margin-top:7px;padding-top:5px;font-size:8px;display:flex;justify-content:space-between}@page{size:Letter;margin:.4in .4in .45in}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  </style></head><body><main>${publication ? "" : '<div class="draft">DRAFT / NOT FINALIZED / NOT FOR RESIDENT ISSUE - No verified sign-offs.</div>'}
  <div class="brand"><div>${logo(context.propertyLogo)}<strong>${escape(context.propertyName)}</strong></div><div>${logo(context.companyLogo)}<span><small>Managed by</small><strong>${escape(context.companyName || "Not selected")}</strong></span></div></div>
  <h1>${escape(settings.title)}</h1><p class="note">${escape(settings.introduction)}</p>
  <div class="identity"><div>Property<strong>${escape(context.propertyCode)}</strong></div><div>Unit<strong>${escape(context.unitNumber || "Branding preview - no unit selected")}</strong></div><div>Inspection date${publication ? "" : " (draft)"}<strong>${escape(draft.inspectionDate || "Not recorded")}</strong></div></div>
  <p class="note">${publication ? "Summary of saved preparation and presentation checks. Grouped checks cover all applicable rooms; N/A means not applicable. This report is not a signed certification." : "Checked = manually recorded in this draft, not inferred from board status or a scheduled date. Grouped checks cover all applicable rooms. Technical tests and independent review require separate verified sign-offs."}</p>
  <div class="columns"><div>${sections.slice(0, legacy ? 3 : 1).map(sectionHtml).join("")}</div><div>${sections.slice(legacy ? 3 : 1).map(sectionHtml).join("")}</div></div>
  <div class="handoff">${details.map(([label,value]) => `<div>${label}<strong>${escape(value || "Not recorded")}</strong></div>`).join("")}</div>
  <p class="note"><b>Keys / fobs / remotes:</b> ${draft.handoffConfirmed ? (publication ? "Handoff counts confirmed in the saved inspection." : "Counts confirmed by final-walk reviewer in this draft.") : "Final-walk count confirmation not recorded."}</p>
  <div class="signoffs"><div>Assigned technician (not a signature)<strong>${escape(context.technician || "Unassigned")}</strong>${publication ? "Technical preparation recorded" : "Preparation sign-off: not recorded"}</div><div>${publication ? "Report exported by (not a signature)" : "Assigned final reviewer (not a signature)"}<strong>${escape(publication?.exportedBy ?? context.reviewer ?? "Unassigned")}</strong>${publication ? escape(publication.exportedAt) : "Independent sign-off: not recorded"}</div></div>
  <p class="note">${escape(settings.footer)}</p><footer><span>Prepared with MakeReadyOS / ${publication ? "Resident copy" : "Draft preview"}</span><b>${publication ? `Saved revision ${escape(publication.revision)}` : "NOT ISSUED"}</b></footer></main></body></html>`;
}
