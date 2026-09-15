import { z } from "zod";

export const pmDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid calendar date");
export const pmFrequency = z.enum(["Daily", "Weekly", "Biweekly", "Monthly", "Quarterly", "Semi-Annual", "Annual", "Custom"]);

// Inspection dates are calendar dates, not completion timestamps. Keep the
// original day-of-month so a February clamp does not shift every later cycle.
export function nextPmStarterDate(template: { frequency: string; firstDueDate: Date; customEveryDays: number | null }, previous: Date) {
  if (template.firstDueDate > previous) return template.firstDueDate;
  const next = new Date(previous);
  const months = ({ Monthly: 1, Quarterly: 3, "Semi-Annual": 6, Annual: 12 } as Record<string, number>)[template.frequency];
  if (months) {
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(template.firstDueDate.getUTCDate(), lastDay));
  } else {
    next.setUTCDate(next.getUTCDate() + (({ Daily: 1, Weekly: 7, Biweekly: 14 } as Record<string, number>)[template.frequency] ?? template.customEveryDays ?? 30));
  }
  return next;
}
export const pmStarters = [
  { key: "lighting", name: "Lighting inspection log", category: "Electrical", frequency: "Weekly", instructions: "Walk exterior paths, parking areas, stairs and common areas. Record fixture/location, working or failed, visible damage, repair needed and follow-up. Observe after dark where practical; do not perform energized electrical work without authorization." },
  { key: "property", name: "Property inspection log", category: "Grounds", frequency: "Weekly", instructions: "Walk buildings, grounds, sidewalks, amenities and trash areas. Record hazards, leaks, damage, cleanliness, photos and work orders or follow-up owners." },
  { key: "sprinkler", name: "Landscape sprinkler / irrigation log", category: "Irrigation", frequency: "Weekly", instructions: "Check landscape irrigation zones, heads, coverage, visible leaks and controller schedule. Record zone, finding, repair and follow-up. This is not a fire-sprinkler inspection or certification." },
  { key: "unit-inspection", name: "Unit inspection log", category: "Building", frequency: "Quarterly", instructions: "Follow property entry/notice requirements. Record entry outcome, leaks, plumbing, HVAC/filter condition, appliance condition, doors/windows, visible damage, safety concerns, photos and follow-up work. If entry is unavailable, record the reason and reschedule rather than marking Pass." },
  { key: "warranty", name: "Warranty review log", category: "General", frequency: "Monthly", instructions: "Record equipment/item, location, serial number, installation date, warranty expiration, vendor/contact, coverage, claim status and next action. Attach warranty documents and quotes. Review upcoming expirations; this recurring log is not an automatic warranty-expiry tracker." },
  { key: "hvac", name: "HVAC / filter inspection", category: "HVAC", frequency: "Quarterly", instructions: "Record equipment/location, filter size and condition, replacement, visible condensate leaks, unusual operation and service follow-up. Follow equipment instructions and qualified-service requirements." },
  { key: "gate", name: "Gate and access inspection", category: "Gate", frequency: "Monthly", instructions: "Observe gates, pedestrian access, latches, visible damage and reported access problems. Record findings and qualified vendor follow-up. Do not bypass safety devices." },
  { key: "roof", name: "Roof / drainage observation log", category: "Roof", frequency: "Semi-Annual", instructions: "From safe accessible locations, record visible roof/drainage concerns, gutter blockage, water intrusion and vendor follow-up. Arrange qualified access for elevated inspections." },
  { key: "fire-safety", name: "Fire safety visual check log", category: "Fire Safety", frequency: "Monthly", instructions: "Record visible access obstructions, signage, reported alarm issues and equipment service labels. Escalate concerns to qualified providers. This visual log does not replace required licensed inspections or testing." },
  { key: "equipment", name: "Equipment service / annual review", category: "General", frequency: "Annual", instructions: "Review manufacturer service intervals, equipment condition, service records, vendor recommendations, parts and planned replacement. Record actions, owner and follow-up dates." },
] as const;

export function planUnitInspectionDates<T extends { id: string; number: string; building: string | null }>(units: T[], from: string, to: string, weekdays: number[]) {
  const start = Date.parse(`${pmDate.parse(from)}T00:00:00Z`);
  const end = Date.parse(`${pmDate.parse(to)}T00:00:00Z`);
  if (end < start || end - start > 366 * 86400000) throw Object.assign(new Error("Choose an inspection window of up to one year, ending on or after its start"), { statusCode: 400 });
  const days: string[] = [];
  for (let time = start; time <= end; time += 86400000) if (weekdays.includes(new Date(time).getUTCDay())) days.push(new Date(time).toISOString().slice(0, 10));
  if (!days.length) throw Object.assign(new Error("No selected weekdays fall in this inspection window"), { statusCode: 400 });
  const sorted = [...units].sort((a, b) => (a.building ?? "").localeCompare(b.building ?? "", "en", { numeric: true }) || a.number.localeCompare(b.number, "en", { numeric: true }) || a.id.localeCompare(b.id));
  return sorted.map((unit, index) => ({ unitId: unit.id, number: unit.number, building: unit.building, dueDate: days[sorted.length <= 1 ? 0 : Math.floor(index * (days.length - 1) / (sorted.length - 1))] }));
}
