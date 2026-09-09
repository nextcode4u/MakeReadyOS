import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "../apps/api/node_modules/typescript/lib/typescript.js";

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync("apps/web/src/lib/materialDraft.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { encodeMaterialDraft, parseMaterialDraft, materialDraftKey } = exports;

test("material IDs retain UUID version and variant without the secure-context randomUUID API", () => {
  const native = "00000000-0000-4000-8000-000000000001";
  assert.equal(exports.createMaterialId({ randomUUID: () => native }), native);
  assert.equal(exports.createMaterialId({ getRandomValues: bytes => bytes.fill(255) }), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  const ids = new Set();
  for (let index = 0; index < 100; index++) {
    const id = exports.createMaterialId({ getRandomValues: bytes => webcrypto.getRandomValues(bytes) });
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 100);
});
const edit = {
  row: { id: "part", name: "Replacement filter", quantity: "", unit: "each", status: "NEEDED", notes: "Confirm size" },
  snapshot: { rows: [], version: 7, readOnly: false },
};

test("material draft restores incomplete input and original optimistic version", () => {
  const raw = encodeMaterialDraft("tech", "turn", edit);
  assert.equal(JSON.stringify(parseMaterialDraft(raw, "tech", "turn")), JSON.stringify(edit));
});

test("material drafts are scoped to both account and turn", () => {
  const raw = encodeMaterialDraft("tech", "turn", edit);
  assert.equal(parseMaterialDraft(raw, "other", "turn"), null);
  assert.equal(parseMaterialDraft(raw, "tech", "other"), null);
  assert.notEqual(materialDraftKey("a:b", "c"), materialDraftKey("a", "b:c"));
});

test("material drafts reject malformed, excessive and incompatible browser data", () => {
  for (const raw of [null, "{", "null", "[]", "x".repeat(250001)]) assert.equal(parseMaterialDraft(raw, "tech", "turn"), null);
  for (const broken of [
    { ...edit, row: { ...edit.row, status: "UNKNOWN" } },
    { ...edit, row: { ...edit.row, notes: "x".repeat(1001) } },
    { ...edit, snapshot: { ...edit.snapshot, version: -1 } },
    { ...edit, snapshot: { ...edit.snapshot, rows: [null] } },
    { ...edit, snapshot: { ...edit.snapshot, rows: Array(101).fill(edit.row) } },
  ]) assert.equal(parseMaterialDraft(encodeMaterialDraft("tech", "turn", broken), "tech", "turn"), null);
});
