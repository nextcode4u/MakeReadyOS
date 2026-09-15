import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { emptyOnCall, onCallSchema, publicOnCall } from "./onCall.js";
import { handoffInstant, onCallSchedule } from "./onCallRotation.js";

function fixture() {
  return onCallSchema.parse({ ...emptyOnCall(), people: ["Zack", "Williams", "Third"].map(name => ({ id: randomUUID(), name, publicPhone: "" })), properties: [1, 2].map(index => ({ id: randomUUID(), name: `Property ${index}`, address: "", shopLocation: "", accessCodes: "", instructions: "", mapUrl: "", guideUrl: "" })) });
}
test("handoffs stay at local 5pm across daylight-saving transitions", () => {
  assert.equal(handoffInstant("2026-03-06", "17:00", "America/Chicago"), "2026-03-06T23:00:00.000Z");
  assert.equal(handoffInstant("2026-03-13", "17:00", "America/Chicago"), "2026-03-13T22:00:00.000Z");
  assert.equal(handoffInstant("2026-11-06", "17:00", "America/Chicago"), "2026-11-06T23:00:00.000Z");
  assert.equal(handoffInstant("2026-03-08", "02:30", "America/Chicago"), "2026-03-08T08:30:00.000Z");
  assert.equal(handoffInstant("2026-11-01", "01:30", "America/Chicago"), "2026-11-01T06:30:00.000Z");
});
test("rotation repeats indefinitely and switches exactly at the handoff", () => {
  const data = fixture();
  data.rotation = { enabled: true, startDate: "2026-09-07", weekday: 5, at: "17:00", personIds: data.people.map(person => person.id), propertyIds: data.properties.map(property => property.id) };
  const rows = onCallSchedule(data, Date.parse("2026-09-14T12:00:00Z")).shifts;
  assert.equal(rows[0].start, "2026-09-11T22:00:00.000Z");
  assert.equal(rows[0].personId, data.people[0].id);
  assert.equal(rows[1].personId, data.people[1].id);
  assert.equal(rows[3].personId, data.people[0].id);
  const boundary = rows[1].start;
  assert.deepEqual(rows.filter(row => row.start <= boundary && row.end > boundary).map(row => row.personId), [data.people[1].id]);
  const later = onCallSchedule(data, Date.parse("2036-09-14T12:00:00Z")).shifts;
  assert.ok(later.some(row => row.start <= "2036-09-14T12:00:00.000Z" && row.end > "2036-09-14T12:00:00.000Z"));
  assert.ok(later.length < 110);
});
test("emergency coverage splits a shift and normal coverage resumes without changing the order", () => {
  const data = fixture();
  data.rotation = { enabled: true, startDate: "2026-09-11", weekday: 5, at: "17:00", personIds: data.people.map(person => person.id), propertyIds: data.properties.map(property => property.id) };
  data.coverageChanges = [{ id: randomUUID(), personId: data.people[2].id, start: "2026-09-14T12:00:00.000Z", end: "2026-09-14T18:00:00.000Z", reason: "PRIVATE FAMILY EMERGENCY" }];
  const rows = onCallSchedule(data, Date.parse("2026-09-14T12:00:00Z")).shifts;
  assert.deepEqual(rows.slice(0, 4).map(row => row.personId), [data.people[0].id, data.people[2].id, data.people[0].id, data.people[1].id]);
  assert.equal(rows[0].end, rows[1].start); assert.equal(rows[1].end, rows[2].start);
  assert.ok(!JSON.stringify(rows).includes("FAMILY"));
  assert.ok(!JSON.stringify(publicOnCall(data)).includes("FAMILY"));
  data.shifts = [{ id: randomUUID(), personId: data.people[1].id, backupId: "", propertyIds: [data.properties[0].id], start: data.coverageChanges[0].start, end: data.coverageChanges[0].end, notes: "Manual coverage" }];
  const combined = onCallSchedule(data, Date.parse("2026-09-14T12:00:00Z")).shifts.filter(row => row.start <= data.coverageChanges![0].start && row.end > data.coverageChanges![0].start);
  assert.equal(combined.length, 2);
  assert.equal(combined.flatMap(row => row.propertyIds).length, 2);
});
test("overlapping exceptions, invalid rotation references and detached markers are rejected", () => {
  const data = fixture();
  data.rotation = { enabled: true, startDate: "2026-02-30", weekday: 5, at: "17:00", personIds: [data.people[0].id], propertyIds: [data.properties[0].id] };
  assert.equal(onCallSchema.safeParse(data).success, false);
  data.rotation.startDate = "2026-09-11";
  data.coverageChanges = [1, 2].map(() => ({ id: randomUUID(), personId: data.people[0].id, start: "2026-09-14T12:00:00.000Z", end: "2026-09-14T18:00:00.000Z", reason: "" }));
  assert.equal(onCallSchema.safeParse(data).success, false);
  data.coverageChanges = [];
  data.properties[0].markers = [{ kind: "SHOP", x: .5, y: .5, page: 1 }];
  assert.equal(onCallSchema.safeParse(data).success, false);
});
test("cover now works before the first handoff; pausing leaves manual shifts intact", () => {
  const data = fixture();
  data.rotation = { enabled: true, startDate: "2026-09-18", weekday: 5, at: "17:00", personIds: data.people.map(person => person.id), propertyIds: data.properties.map(property => property.id) };
  data.coverageChanges = [{ id: randomUUID(), personId: data.people[1].id, start: "2026-09-14T12:00:00.000Z", end: "2026-09-18T23:00:00.000Z", reason: "" }];
  const rows = onCallSchedule(data, Date.parse("2026-09-14T12:00:00Z")).shifts;
  assert.equal(rows[0].personId, data.people[1].id);
  assert.equal(rows[0].end, "2026-09-18T22:00:00.000Z");
  assert.equal(rows[1].personId, data.people[1].id);
  assert.equal(rows[2].personId, data.people[0].id);
  data.shifts = [{ id: randomUUID(), personId: data.people[0].id, backupId: "", propertyIds: data.properties.map(property => property.id), start: "2026-09-14T12:00:00.000Z", end: "2026-09-14T18:00:00.000Z", notes: "" }];
  data.rotation.enabled = false;
  assert.deepEqual(onCallSchedule(data).shifts, data.shifts);
});
