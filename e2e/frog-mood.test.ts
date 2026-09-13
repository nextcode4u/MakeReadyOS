import assert from "node:assert/strict";
import test from "node:test";
import { frogWarningMood } from "../apps/web/src/lib/frogMood.js";
import { frogSpriteFrame } from "../apps/web/src/lib/frogSprites.js";

test("frog warning moods prioritize unfinished upcoming move-ins and exclude ready units", () => {
  const now = new Date(2026, 8, 13, 23, 59);
  assert.equal(frogWarningMood({ overdue: true }, now), "sick");
  for (const day of [13, 14, 16]) assert.equal(frogWarningMood({ overdue: true, moveInDate: `2026-09-${day}T00:00:00Z` }, now), "scared");
  for (const date of ["2026-09-17", "2026-09-12", "invalid", "2026-02-31"]) assert.equal(frogWarningMood({ moveInDate: date }, now), null);
  for (const status of ["VACANT LEASED READY", "VACANT_NOT_LEASED_READY"]) assert.equal(frogWarningMood({ overdue: true, vacancyStatus: status, moveInDate: "2026-09-14" }, now), null);
  assert.equal(frogWarningMood({ overdue: true, completionStatus: "YES" }, now), null);
  assert.equal(frogWarningMood({ overdue: true, isArchived: true }, now), null);
  assert.equal(frogWarningMood({ vacancyStatus: "VACANT_NOT_READY", moveInDate: "2026-09-14" }, now), "scared");
});

test("warning sheets cycle through all four populated cells and loop", () => {
  for (const pose of ["sick", "scared"]) {
    const frames = Array.from({ length: 24 }, (_, tick) => frogSpriteFrame(64, pose, 5, tick));
    assert.equal(new Set(frames.map(frame => `${frame.col}:${frame.row}`)).size, 4);
    assert.ok(frames.every(frame => frame.col <= 1 && frame.row <= 1 && frame.action === pose));
    assert.deepEqual(frames[0], frogSpriteFrame(64, pose, 5, pose === "sick" ? 12 : 8));
  }
});
