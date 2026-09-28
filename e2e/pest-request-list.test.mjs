import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

function helper(getPestIssues) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("apps/web/src/lib/pestRequestList.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: () => ({ getPestIssues }) });
  return exports;
}
test("copy formatting omits closed history and private reporter data", () => {
  const issue = { id: "one", property: { code: "DEMO" }, unit: { number: "101" }, pestType: "Ants", status: "Open", priority: "Normal", description: "Kitchen\nnear sink", reportedBy: "Private name", notes: [{ body: "Internal note" }] };
  const api = helper();
  const text = api.formatPestRequestList([issue, { ...issue, id: "closed", status: "Closed" }, { ...issue, id: "archived", isArchived: true }], "en");
  assert.equal(text, "Active pest requests (1)\nDEMO / 101 | Ants | Open | Kitchen near sink");
  assert.match(api.formatPestRequestList([issue], "es"), /Solicitudes activas/);
});
test("active list fetches every page with the same property and focus filters", async () => {
  const calls = [];
  const api = helper(async filters => {
    calls.push(filters);
    return { issues: [{ id: String(filters.offset) }], pagination: { hasMore: filters.offset === 0 } };
  });
  const result = await api.loadActivePestRequests({ propertyId: "demo", overdueOnly: true, q: "Ants" });
  assert.equal(result.issues.length, 2);
  assert.deepEqual(calls.map(call => call.offset), [0, 1]);
  assert.ok(calls.every(call => call.activeOnly && !call.includeArchived && call.overdueOnly && call.propertyId === "demo" && call.q === "Ants"));
});
