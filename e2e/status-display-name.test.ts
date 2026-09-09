import assert from "node:assert/strict";
import { test } from "node:test";
import { statusDisplayName } from "../apps/web/src/lib/statusDisplayName.js";
import { LabelPill } from "../apps/web/src/components/LabelPill.js";

test("status display names preserve canonical values and explicitly supplied unit captions", () => {
  const label = { id: "label", fieldKey: "vacancyStatus", value: "VACANT_READY", displayName: "Resident_ready", color: "#123456", textColor: "#ffffff", sortOrder: 0 };
  assert.equal(statusDisplayName({ value: label.value }), "VACANT READY");
  assert.equal(statusDisplayName(label), "Resident_ready");
  assert.equal(LabelPill({ value: label.value, label }).props.children, "Resident_ready");
  assert.equal(LabelPill({ value: "TA 101", label }).props.children, "TA 101");
  assert.equal(LabelPill({ value: null, label }).props.children, "-");
  assert.equal(label.value, "VACANT_READY");
});
