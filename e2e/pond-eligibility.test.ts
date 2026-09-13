import assert from "node:assert/strict";
import test from "node:test";
import { pondEligible } from "../apps/web/src/lib/pondEligibility.js";

test("pond excludes property-scoped down sections and down/model inventory", () => {
  const sections = [{ propertyId: "ta", key: "custom-down", sectionType: "DOWN" }];
  const item = { propertyId: "ta", boardGroup: "custom-down", vacancyStatus: "VACANT NOT LEASED NOT READY" };
  assert.equal(pondEligible(item, sections), false);
  assert.equal(pondEligible({ ...item, propertyId: "vab" }, sections), true);
  assert.equal(pondEligible({ ...item, boardGroup: "MAKE_READY" }, sections), true);
  for (const vacancyStatus of ["DOWN", " down ", "MODEL"]) assert.equal(pondEligible({ ...item, boardGroup: "MAKE_READY", vacancyStatus }, []), false);
});
