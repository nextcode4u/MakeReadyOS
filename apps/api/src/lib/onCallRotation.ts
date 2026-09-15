import { createHash } from "node:crypto";
import type { OnCallData } from "./onCall.js";

const dayMs = 86400000;
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
function wallTime(time: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(time);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
// Repeated local times use the first occurrence; a DST gap moves forward by the gap.
export function handoffInstant(date: string, at: string, zone: string) {
  const target = `${date}T${at}`;
  const nominal = Date.parse(`${target}:00Z`);
  const offsets = new Set([-2, 0, 2].map(days => {
    const probe = nominal + days * dayMs;
    return Date.parse(`${wallTime(probe, zone)}:00Z`) - probe;
  }));
  const candidates = [...offsets].map(offset => nominal - offset).sort((a, b) => a - b);
  const exact = candidates.find(value => wallTime(value, zone) === target);
  const next = candidates.filter(value => wallTime(value, zone) > target).sort((a, b) => wallTime(a, zone).localeCompare(wallTime(b, zone)))[0];
  if (exact === undefined && next === undefined) throw new Error("Unable to resolve handoff time in the selected time zone");
  return new Date(exact ?? next).toISOString();
}
const stableId = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
export function onCallSchedule(data: OnCallData, now = Date.now()) {
  const from = now - 366 * dayMs;
  const through = now + 366 * dayMs;
  const rows = [...data.shifts];
  const rotation = data.rotation;
  if (rotation?.enabled) {
    const weekday = new Date(`${rotation.startDate}T12:00:00Z`).getUTCDay();
    const anchor = addDays(rotation.startDate, (rotation.weekday - weekday + 7) % 7);
    const anchorInstant = handoffInstant(anchor, rotation.at, data.timeZone);
    // Explicit emergency cover can start before the first regular handoff.
    for (const change of data.coverageChanges ?? []) {
      const end = change.end < anchorInstant ? change.end : anchorInstant;
      if (change.start >= end || Date.parse(end) <= from || Date.parse(change.start) > through) continue;
      const manual = data.shifts.filter(shift => shift.start < end && shift.end > change.start);
      const boundaries = [...new Set([change.start, end, ...manual.flatMap(shift => [shift.start, shift.end].filter(value => value > change.start && value < end))])].sort();
      for (let part = 0; part < boundaries.length - 1; part++) {
        const start = boundaries[part]; const finish = boundaries[part + 1];
        const propertyIds = rotation.propertyIds.filter(id => !manual.some(shift => shift.propertyIds.includes(id) && shift.start <= start && shift.end > start));
        if (propertyIds.length) rows.push({ id: stableId(`${start}/${finish}/${propertyIds.join(",")}`), start, end: finish, personId: change.personId, backupId: "", propertyIds, notes: "Coverage change" });
      }
    }
    const first = Math.max(0, Math.floor((from - Date.parse(`${anchor}T00:00:00Z`)) / (7 * dayMs)) - 1);
    for (let index = first; index < first + 110; index++) {
      const start = handoffInstant(addDays(anchor, index * 7), rotation.at, data.timeZone);
      const end = handoffInstant(addDays(anchor, (index + 1) * 7), rotation.at, data.timeZone);
      if (Date.parse(start) > through) break;
      if (Date.parse(end) <= from) continue;
      const exceptions = (data.coverageChanges ?? []).filter(change => change.start < end && change.end > start);
      const manual = data.shifts.filter(shift => shift.start < end && shift.end > start && shift.propertyIds.some(id => rotation.propertyIds.includes(id)));
      const boundaries = [...new Set([start, end, ...[...exceptions, ...manual].flatMap(change => [change.start, change.end].filter(value => value > start && value < end))])].sort();
      for (let part = 0; part < boundaries.length - 1; part++) {
        const a = boundaries[part]; const b = boundaries[part + 1];
        const propertyIds = rotation.propertyIds.filter(id => !manual.some(shift => shift.propertyIds.includes(id) && shift.start <= a && shift.end > a));
        if (!propertyIds.length) continue;
        const exception = exceptions.find(change => change.start <= a && change.end > a);
        rows.push({ id: stableId(`${a}/${b}/${propertyIds.join(",")}`), start: a, end: b, personId: exception?.personId ?? rotation.personIds[index % rotation.personIds.length], backupId: "", propertyIds, notes: exception ? "Coverage change" : "Weekly rotation" });
      }
    }
  }
  return { shifts: rows.sort((a, b) => a.start.localeCompare(b.start)), from: new Date(from).toISOString(), through: new Date(through).toISOString() };
}
