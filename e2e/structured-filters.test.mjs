import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync("apps/web/src/lib/structuredFilters.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { defaultStructuredFilters, itemMatchesStructuredFilters } = exports;
const now = new Date(2026, 8, 8, 12);
const matches = (patch) => itemMatchesStructuredFilters({
  isArchived: false, moveInDate: "2026-09-10T12:00:00", makeReadyDate: "2026-09-09T12:00:00",
  completionStatus: "NO", vacancyStatus: "VACANT LEASED NOT READY", ...patch,
}, { ...defaultStructuredFilters, moveInRiskOnly: true }, [], [], now);

test("move-in risk includes repair-complete turns awaiting final inspection", () => {
  for (const makeReadyStatus of ["FINAL WALK", "FINAL_WALK", "final-walk"]) {
    assert.equal(matches({ makeReadyStatus, completionStatus: "YES", vacancyStatus: "VACANT LEASED READY" }), true);
  }
});

test("ready turns do not retain move-in risk from historical date conflicts", () => {
  for (const completionStatus of ["YES", "DONE", "COMPLETE", "COMPLETED"]) {
    assert.equal(matches({ completionStatus, makeReadyDate: "2026-09-12T12:00:00" }), false);
  }
  for (const vacancyStatus of ["VACANT_READY", "VACANT LEASED READY", "VACANT_NOT_LEASED_READY"]) {
    assert.equal(matches({ vacancyStatus }), false);
  }
});

test("unfinished turns retain imminent and later conflicting move-in risks", () => {
  assert.equal(matches({}), true);
  assert.equal(matches({ moveInDate: "2026-10-10T12:00:00" }), false);
  assert.equal(matches({ moveInDate: "2026-10-10T12:00:00", makeReadyDate: "2026-10-12T12:00:00" }), true);
  assert.equal(matches({ moveInDate: null }), false);
});
