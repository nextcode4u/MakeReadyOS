import assert from "node:assert/strict";
import { test } from "node:test";
import { readyVacancyStatus } from "./readyVacancyStatus.js";

test("marking work ready preserves leasing and occupancy facts", () => {
  for (const value of ["VACANT", "VACANT_READY", "VACANT_NOT_LEASED", "VACANT NOT LEASED READY", "VACANT NOT LEASED NOT READY"]) {
    assert.equal(readyVacancyStatus(value), "VACANT NOT LEASED READY", value);
  }
  for (const value of ["VACANT_LEASED", "VACANT LEASED READY", "VACANT LEASED NOT READY", " vacant_leased "]) {
    assert.equal(readyVacancyStatus(value), "VACANT LEASED READY", value);
  }
  for (const value of ["NTV LEASED", "NTV NOT LEASED", "NTV_LEASED", "NTV_NOT_LEASED", "OCCUPIED", "DOWN", "Custom status", ""]) {
    assert.equal(readyVacancyStatus(value), value, value);
  }
  assert.equal(readyVacancyStatus(null), null);
  assert.equal(readyVacancyStatus(undefined), null);
});
