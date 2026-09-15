import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const id = z.string().uuid();
const link = z.union([z.literal(""), z.string().url().max(2000).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS link without embedded credentials")]);
export const onCallSchema = z.object({
  title: text(100).min(1),
  timeZone: text(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Select a valid time zone"),
  people: z.array(z.object({ id, name: text(100).min(1), publicPhone: text(40).regex(/^[+\d\s().x-]*$/) }).strict()).max(200),
  properties: z.array(z.object({ id, name: text(100).min(1), address: text(500), shopLocation: text(1000), accessCodes: text(2000), instructions: text(12000), mapUrl: link, guideUrl: link }).strict()).max(100),
  shifts: z.array(z.object({ id, personId: id, backupId: z.union([id, z.literal("")]), propertyIds: z.array(id).min(1).max(100), start: z.string().datetime(), end: z.string().datetime(), notes: text(1000) }).strict()).max(2000),
}).strict().superRefine((data, ctx) => {
  for (const field of ["people", "properties", "shifts"] as const) {
    if (new Set(data[field].map(row => row.id)).size !== data[field].length) ctx.addIssue({ code: "custom", path: [field], message: "Duplicate record IDs" });
  }
  const people = new Set(data.people.map(person => person.id));
  const properties = new Set(data.properties.map(property => property.id));
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
