import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { emptyOnCall, onCallSchema, publicOnCall } from "./onCall.js";

function fixture() {
  const person = { id: randomUUID(), name: "On-call tech", publicPhone: "555-0100" };
  const property = { id: randomUUID(), name: "External property", address: "PRIVATE-ADDRESS", shopLocation: "PRIVATE-SHOP", accessCodes: "PRIVATE-CODE", instructions: "PRIVATE-GUIDE", mapUrl: "https://example.com/private-map", guideUrl: "https://example.com/private-guide" };
  return { ...emptyOnCall(), people: [person], properties: [property], shifts: [{ id: randomUUID(), personId: person.id, backupId: "", propertyIds: [property.id], start: "2026-09-14T12:00:00.000Z", end: "2026-09-21T12:00:00.000Z", notes: "Public handoff" }] };
}
test("public on-call payload excludes all protected property fields", () => {
  const data = onCallSchema.parse(fixture());
  const visible = publicOnCall(data);
  assert.deepEqual(visible.properties, [{ id: data.properties[0].id, name: data.properties[0].name }]);
  assert.ok(!JSON.stringify(visible).includes("PRIVATE"));
  assert.ok(!JSON.stringify(visible).includes("example.com"));
  assert.equal(visible.shifts[0].notes, "Public handoff");
});
test("on-call validates time ranges, references, links, timezone and duplicate IDs", () => {
  const data = fixture();
  assert.equal(onCallSchema.safeParse(data).success, true);
  assert.equal(onCallSchema.safeParse({ ...data, timeZone: "Nowhere/Invalid" }).success, false);
  assert.equal(onCallSchema.safeParse({ ...data, people: [] }).success, false);
  assert.equal(onCallSchema.safeParse({ ...data, properties: [] }).success, false);
  assert.equal(onCallSchema.safeParse({ ...data, people: [data.people[0], data.people[0]] }).success, false);
  assert.equal(onCallSchema.safeParse({ ...data, shifts: [{ ...data.shifts[0], end: data.shifts[0].start }] }).success, false);
  assert.equal(onCallSchema.safeParse({ ...data, shifts: [{ ...data.shifts[0], backupId: data.people[0].id }] }).success, false);
  assert.equal(onCallSchema.safeParse({ ...data, properties: [{ ...data.properties[0], mapUrl: "javascript:alert(1)" }] }).success, false);
  assert.equal(onCallSchema.safeParse({ ...data, properties: [{ ...data.properties[0], mapUrl: "https://user:password@example.com" }] }).success, false);
});
