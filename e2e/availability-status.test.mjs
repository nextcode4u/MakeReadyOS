import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

function load(path) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports });
  return exports;
}

const api = load("../apps/api/src/lib/availabilityStatus.ts");
const web = load("../apps/web/src/lib/availabilityStatus.ts");

test("unrecognized or missing imported occupancy never becomes occupied", () => {
  for (const input of ["", " ", "unfamiliar source status", "UNKNOWN", "UNK", "n/a"]) {
    assert.equal(web.normalizeOccupancy(input), "UNKNOWN", input);
  }
  assert.equal(web.normalizeOccupancy("occ"), "OCCUPIED");
  assert.equal(web.normalizeOccupancy("NTV_NOT_LEASED"), "NTV NOT LEASED");
  assert.equal(web.normalizeOccupancy("NTV-LEASED"), "NTV LEASED");
  assert.equal(web.normalizeOccupancy("VACANT_NOT_LEASED_NOT_READY"), "VACANT NOT LEASED NOT READY");
  assert.equal(web.normalizeOccupancy("VACANT-LEASED-READY"), "VACANT LEASED READY");
});

test("API and preview readiness agree across status separators", () => {
  for (const separator of [" ", "_", "-", "  "]) {
    for (const [status, expected] of [["VACANT NOT LEASED NOT READY", false], ["VACANT LEASED NOT READY", false], ["VACANT NOT LEASED READY", true], ["VACANT LEASED READY", true], ["NTV NOT LEASED", false], ["NTV LEASED", false]]) {
      const input = ` ${status.toLowerCase().replaceAll(" ", separator)} `;
      assert.equal(api.isReadyAvailabilityStatus(input), expected, input);
      assert.equal(web.isReadyLikeOccupancy(input), expected, input);
    }
  }
  for (const input of [null, undefined, "", "ALREADY", "OCCUPIED", "UNKNOWN"]) {
    assert.equal(api.isReadyAvailabilityStatus(input), false);
    assert.equal(web.isReadyLikeOccupancy(input), false);
  }
});

test("notice units remain physically occupied regardless of lease or separator", () => {
  for (const separator of [" ", "_", "-", "  "]) {
    for (const status of ["OCCUPIED", "NTV", "NTV LEASED", "NTV NOT LEASED"]) {
      assert.equal(web.isPhysicallyOccupiedStatus(` ${status.toLowerCase().replaceAll(" ", separator)} `), true);
    }
  }
  for (const input of [null, "", "UNKNOWN", "VACANT LEASED READY", "VACANT_NOT_LEASED_NOT_READY", "DOWN"]) {
    assert.equal(web.isPhysicallyOccupiedStatus(input), false);
  }
});
