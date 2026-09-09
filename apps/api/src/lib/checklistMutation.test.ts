import assert from "node:assert/strict";
import test from "node:test";
import { checklistMutation } from "./checklistMutation.js";

test("note edits and repeated completion preserve the original completion attribution", () => {
  for (const completed of [true, false]) {
    assert.deepEqual(checklistMutation({ completed }, { notes: "Updated note" }, "other"), {
      completionChanged: false, data: { notes: "Updated note" },
    });
    assert.deepEqual(checklistMutation({ completed }, { completed }, "other"), {
      completionChanged: false, data: {},
    });
  }
});

test("actual completion transitions stamp or clear the audit fields", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  assert.deepEqual(checklistMutation({ completed: false }, { completed: true }, "tech", now), {
    completionChanged: true, data: { completed: true, completedAt: now, completedById: "tech" },
  });
  assert.deepEqual(checklistMutation({ completed: true }, { completed: false, notes: null }, "tech"), {
    completionChanged: true, data: { completed: false, completedAt: null, completedById: null, notes: null },
  });
});
