import assert from "node:assert/strict";
import { test } from "node:test";
import { unitTurnStoredName } from "./uploadStorage.js";

test("turn uploads have identifiable property, unit, stable turn and stage folders", () => {
  const item = { id: "turn123", unitNumber: "163", createdAt: new Date("2026-09-09T12:00:00Z"), property: { code: "DG" } };
  assert.equal(unitTurnStoredName(item, "uuid-kitchen.jpg", "INITIAL_WALK"), "DG/units/163/turn-2026-09-09-turn123/initial-walk/uuid-kitchen.jpg");
  assert.notEqual(unitTurnStoredName(item, "photo.jpg"), unitTurnStoredName({ ...item, id: "next-turn" }, "photo.jpg"));
  assert.ok(unitTurnStoredName({ ...item, property: { code: "DG", uploadStorageMode: "PROPERTY_SUBDIR", uploadSubdir: "Properties/DG" } }, "photo.jpg").startsWith("Properties/DG/units/163/"));
  const path = unitTurnStoredName({ ...item, unitNumber: "../../163" }, "../photo.jpg");
  assert.ok(!path.split("/").includes(".."));
});
