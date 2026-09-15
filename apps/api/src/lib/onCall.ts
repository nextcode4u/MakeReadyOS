import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const id = z.string().uuid();
const instant = z.string().datetime().transform(value => new Date(value).toISOString());
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; });
const marker = z.object({ kind: z.enum(["SHOP", "OFFICE"]), x: z.number().min(0).max(1), y: z.number().min(0).max(1), page: z.number().int().min(1).max(50) }).strict();
export const onCallMapSchema = z.object({ id, name: text(180).min(1), mime: z.enum(["application/pdf", "image/png", "image/jpeg"]), size: z.number().int().positive().max(10 * 1024 * 1024) }).strict();
const link = z.union([z.literal(""), z.string().url().max(2000).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS link without embedded credentials")]);
export const onCallSchema = z.object({
  title: text(100).min(1),
  timeZone: text(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Select a valid time zone"),
  people: z.array(z.object({ id, name: text(100).min(1), publicPhone: text(40).regex(/^[+\d\s().x-]*$/) }).strict()).max(200),
  properties: z.array(z.object({ id, name: text(100).min(1), address: text(500), shopLocation: text(1000), accessCodes: text(2000), instructions: text(12000), mapUrl: link, guideUrl: link, mapFile: onCallMapSchema.nullable().optional(), markers: z.array(marker).max(2).optional() }).strict()).max(100),
  rotation: z.object({ enabled: z.boolean(), startDate: dateOnly, startPersonId: id.optional(), weekday: z.number().int().min(0).max(6), at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), personIds: z.array(id).min(1).max(200), propertyIds: z.array(id).min(1).max(100) }).strict().nullable().optional(),
  coverageChanges: z.array(z.object({ id, personId: id, start: instant, end: instant, reason: text(500) }).strict()).max(500).optional(),
  shifts: z.array(z.object({ id, personId: id, backupId: z.union([id, z.literal("")]), propertyIds: z.array(id).min(1).max(100), start: instant, end: instant, notes: text(1000) }).strict()).max(2000),
}).strict().superRefine((data, ctx) => {
  for (const field of ["people", "properties", "shifts"] as const) {
    if (new Set(data[field].map(row => row.id)).size !== data[field].length) ctx.addIssue({ code: "custom", path: [field], message: "Duplicate record IDs" });
  }
  const people = new Set(data.people.map(person => person.id));
  const properties = new Set(data.properties.map(property => property.id));
  if (data.rotation) {
    if (data.rotation.startPersonId && !data.rotation.personIds.includes(data.rotation.startPersonId)) ctx.addIssue({ code: "custom", path: ["rotation", "startPersonId"], message: "Choose a starting person who is in the rotation" });
    for (const field of ["personIds", "propertyIds"] as const) {
      const values = data.rotation[field];
      if (new Set(values).size !== values.length || values.some(value => !(field === "personIds" ? people : properties).has(value))) ctx.addIssue({ code: "custom", path: ["rotation", field], message: "Choose existing, unique people and properties for the rotation" });
    }
  }
  for (const property of data.properties) {
    if (property.markers?.length && (!property.mapFile || new Set(property.markers.map(pin => pin.kind)).size !== property.markers.length || property.markers.some(pin => property.mapFile?.mime !== "application/pdf" && pin.page !== 1))) ctx.addIssue({ code: "custom", path: ["properties"], message: "Shop/office markers require an uploaded map and must be unique" });
  }
  const changes = data.coverageChanges ?? [];
  if (new Set(changes.map(change => change.id)).size !== changes.length) ctx.addIssue({ code: "custom", path: ["coverageChanges"], message: "Duplicate coverage change IDs" });
  for (const [index, change] of changes.entries()) {
    if (!data.rotation || !people.has(change.personId) || change.end <= change.start || changes.some((other, j) => j < index && other.start < change.end && other.end > change.start)) ctx.addIssue({ code: "custom", path: ["coverageChanges", index], message: "Choose an existing person, a valid coverage period, and non-overlapping coverage changes" });
  }
  for (const [index, shift] of data.shifts.entries()) {
    if (!people.has(shift.personId) || shift.backupId && !people.has(shift.backupId) || shift.backupId === shift.personId) ctx.addIssue({ code: "custom", path: ["shifts", index], message: "Choose an existing primary and a different backup; remove their shifts before deleting a person" });
    if (shift.propertyIds.some(property => !properties.has(property)) || new Set(shift.propertyIds).size !== shift.propertyIds.length) ctx.addIssue({ code: "custom", path: ["shifts", index], message: "Choose existing properties; remove their shifts before deleting a property" });
    if (Date.parse(shift.end) <= Date.parse(shift.start)) ctx.addIssue({ code: "custom", path: ["shifts", index], message: "Shift end must be after its start" });
  }
});
export type OnCallData = z.infer<typeof onCallSchema>;
export const emptyOnCall = (): OnCallData => ({ title: "On-call", timeZone: "America/Chicago", people: [], properties: [], shifts: [] });
// The public response is an explicit allowlist, never the private payload with fields hidden by CSS.
export function publicOnCall(data: OnCallData) {
  return { title: data.title, timeZone: data.timeZone, people: data.people.map(({ id, name, publicPhone }) => ({ id, name, publicPhone })), properties: data.properties.map(({ id, name }) => ({ id, name })), shifts: data.shifts };
}
