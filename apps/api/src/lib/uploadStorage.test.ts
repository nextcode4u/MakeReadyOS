import assert from "node:assert/strict";
import { test } from "node:test";
import { unitTurnStoredName } from "./uploadStorage.js";

test("turn uploads have identifiable property, unit, stable turn and stage folders", () => {
  const item = { id: "turn123", unitNumber: "163", createdAt: new Date("2026-09-09T12:00:00Z"), property: { code: "TA" } };
  assert.equal(unitTurnStoredName(item, "uuid-kitchen.jpg", "INITIAL_WALK"), "TA/units/163/turn-2026-09-09-turn123/initial-walk/uuid-kitchen.jpg");
  assert.notEqual(unitTurnStoredName(item, "photo.jpg"), unitTurnStoredName({ ...item, id: "next-turn" }, "photo.jpg"));
  assert.ok(unitTurnStoredName({ ...item, property: { code: "TA", uploadStorageMode: "PROPERTY_SUBDIR", uploadSubdir: "Properties/TA" } }, "photo.jpg").startsWith("Properties/TA/units/163/"));
  const path = unitTurnStoredName({ ...item, unitNumber: "../../163" }, "../photo.jpg");
  assert.ok(!path.split("/").includes(".."));
});
