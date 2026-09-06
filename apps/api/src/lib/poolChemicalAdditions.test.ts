import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePoolChemicalAdditions } from "./poolChemicalAdditions.js";

test("pool additions require a property chemical and compatible measurement units", () => {
  const chemicals = [
    { id: "acid", name: "Muriatic Acid", unit: "QUARTS", allowedUnits: ["QUARTS", "GALLONS"] },
    { id: "granules", name: "Granules", unit: "POUNDS", allowedUnits: [] },
    { id: "inactive", name: "Old Chemical", unit: "POUNDS", isActive: false },
  ];
  const addition = { chemicalId: "acid", chemicalName: "Incorrect client name", amount: 1, unit: "GALLONS" };
  assert.deepEqual(validatePoolChemicalAdditions([addition], chemicals), [{ ...addition, chemicalName: "Muriatic Acid" }]);
  for (const unit of ["QUARTS", "GALLONS"]) assert.equal(validatePoolChemicalAdditions([{ ...addition, unit }], chemicals)[0].unit, unit);
  for (const unit of ["POUNDS", "OUNCES"]) assert.equal(validatePoolChemicalAdditions([{ ...addition, chemicalId: "granules", unit }], chemicals)[0].unit, unit);
  for (const chemicalId of ["other-property", "inactive"]) {
    assert.throws(() => validatePoolChemicalAdditions([{ ...addition, chemicalId }], chemicals), { statusCode: 400 });
  }
  assert.throws(() => validatePoolChemicalAdditions([{ ...addition, unit: "POUNDS" }], chemicals), { statusCode: 400 });
  const custom = { chemicalId: null, chemicalName: "Manually recorded product", amount: 2, unit: "QUARTS" };
  assert.deepEqual(validatePoolChemicalAdditions([custom], chemicals), [custom]);
});
