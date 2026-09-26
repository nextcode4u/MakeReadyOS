import assert from "node:assert/strict";
import { test } from "node:test";
import { orderBoardSections } from "../apps/web/src/lib/boardSectionOrder";

const properties = [{ id: "ta", code: "DG" }, { id: "vab", code: "DS" }];
const sections = properties.flatMap((property) => (["READY", "MAKE_READY", "DOWN", "ARCHIVE"] as const).map((sectionType, sortOrder) => ({ key: `${property.code}-${sectionType}`, propertyId: property.id, sectionType, sortOrder })));

test("default board order groups stages before properties, regardless of input or saved sort order", () => {
  const input = sections.map((section) => ({ ...section, sortOrder: 100 - section.sortOrder })).reverse();
  const before = [...input];
  assert.deepEqual(orderBoardSections(input, [...properties].reverse()).map((section) => section.key), [
    "DG-READY", "DS-READY", "DG-MAKE_READY", "DS-MAKE_READY", "DG-DOWN", "DS-DOWN", "DG-ARCHIVE", "DS-ARCHIVE",
  ]);
  assert.deepEqual(input, before);
});

test("single-property and archive-only views retain predictable order", () => {
  assert.deepEqual(orderBoardSections(sections.filter((section) => section.propertyId === "ta").reverse(), properties).map((section) => section.sectionType), ["READY", "MAKE_READY", "DOWN", "ARCHIVE"]);
  assert.deepEqual(orderBoardSections(sections.filter((section) => section.sectionType === "ARCHIVE").reverse(), properties).map((section) => section.key), ["DG-ARCHIVE", "DS-ARCHIVE"]);
  assert.deepEqual(orderBoardSections([], properties), []);
});
