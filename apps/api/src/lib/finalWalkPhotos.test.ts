import assert from "node:assert/strict";
import test from "node:test";
import { validateFollowUpPhotos } from "./finalWalkPhotos.js";
import { emptyReportDraft, reportDraftSchema } from "./finalWalkReport.js";

test("follow-up photo references are bounded, unique and backward compatible", () => {
  const { technicianPhotoIds: _, ...legacy } = emptyReportDraft();
  assert.ok(reportDraftSchema.safeParse(legacy).success);
  assert.ok(reportDraftSchema.safeParse({ ...legacy, technicianPhotoIds: ["photo-1"] }).success);
  for (const count of [12, 13, 50]) {
    assert.ok(reportDraftSchema.safeParse({ ...legacy, technicianPhotoIds: Array.from({ length: count }, (_, i) => `photo-${i}`) }).success);
  }
  for (const ids of [["a", "a"], ["https://example.com/private"], Array.from({ length: 51 }, (_, i) => `photo-${i}`)]) {
    assert.equal(reportDraftSchema.safeParse({ ...legacy, technicianPhotoIds: ids }).success, false);
  }
});

test("follow-up references must be images from the exact unit, not another unit or a document", async () => {
  let calls = 0;
  const db = { itemAttachment: { count: async ({ where }: any) => {
    calls++;
    assert.equal(where.itemId, "unit-a");
    return [{ id: "photo-a", itemId: "unit-a", mimeType: "image/jpeg" }, { id: "photo-b", itemId: "unit-b", mimeType: "image/png" }, { id: "document", itemId: "unit-a", mimeType: "application/pdf" }]
      .filter(file => file.itemId === where.itemId && where.id.in.includes(file.id) && where.mimeType.in.includes(file.mimeType)).length;
  } } } as any;
  await validateFollowUpPhotos(db, "unit-a", []); assert.equal(calls, 0);
  await validateFollowUpPhotos(db, "unit-a", ["photo-a"]);
  for (const id of ["photo-b", "document", "deleted-photo"]) await assert.rejects(validateFollowUpPhotos(db, "unit-a", [id]), { statusCode: 400 });
});
