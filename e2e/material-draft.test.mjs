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

test("single-line recovery preserves unrelated changes and detects committed responses", () => {
  const original = { ...edit.row, quantity: 1 };
  const draft = { row: { ...original, quantity: "2", notes: " supplier " }, snapshot: { ...edit.snapshot, rows: [original] } };
  const latest = { ...edit.snapshot, version: 8, rows: [original, { ...original, id: "other", status: "ORDERED" }] };
  const before = JSON.stringify(latest);
  assert.equal(exports.reviewMaterialEdit(draft, latest).alreadySaved, false);
  assert.equal(JSON.stringify(latest), before);
  const saved = { ...latest, rows: [{ ...draft.row, quantity: 2, notes: "supplier" }, latest.rows[1]] };
  assert.equal(exports.reviewMaterialEdit(draft, saved).alreadySaved, true);
  assert.throws(() => exports.reviewMaterialEdit(draft, { ...latest, readOnly: true }), /read-only/);
  assert.throws(() => exports.reviewMaterialEdit(draft, { ...latest, rows: [{ ...original, status: "ORDERED" }] }), /same parts line/);
  assert.throws(() => exports.reviewMaterialEdit(draft, { ...latest, rows: [] }), /same parts line/);
  const added = { ...draft, snapshot: { ...draft.snapshot, rows: [] } };
  assert.equal(exports.reviewMaterialEdit(added, { ...latest, rows: [] }).alreadySaved, false);
  assert.throws(() => exports.reviewMaterialEdit(added, latest), /same parts line/);
  assert.throws(() => exports.reviewMaterialEdit(added, { ...latest, rows: Array(100).fill(latest.rows[1]) }), /100 lines/);
});

test("material draft restores incomplete input and original optimistic version", () => {
  const raw = encodeMaterialDraft("tech", "turn", edit);
  assert.equal(JSON.stringify(parseMaterialDraft(raw, "tech", "turn")), JSON.stringify(edit));
});

test("Need to order survives draft recovery", () => {
  const request = { ...edit, row: { ...edit.row, status: "NEED_TO_ORDER" } };
  assert.equal(parseMaterialDraft(encodeMaterialDraft("tech", "turn", request), "tech", "turn").row.status, "NEED_TO_ORDER");
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

test("batch recovery keeps newer saved rows and only appends unsaved additions", () => {
  const row = { ...edit.row, quantity: "2", notes: "" };
  const latest = { version: 9, readOnly: false, rows: [{ ...row, id: "teammate", name: "Team order", status: "ORDERED", quantity: 3 }] };
  const before = JSON.stringify(latest);
  const result = exports.reviewMaterialAdditions([row, { ...row, id: "blank", name: "", quantity: 1, unit: "each" }], latest);
  assert.equal(JSON.stringify(result.additions), JSON.stringify([row]));
  assert.equal(result.latest.version, 9);
  assert.equal(JSON.stringify(latest), before);
  assert.equal(result.alreadySaved, 0);
});

test("batch recovery recognizes a saved response that was lost without adding duplicates", () => {
  const row = { ...edit.row, name: " Filter ", quantity: "2", unit: " each ", notes: " Size confirmed " };
  const latest = { version: 8, readOnly: false, rows: [{ ...row, name: "Filter", quantity: 2, unit: "each", notes: "Size confirmed" }] };
  const result = exports.reviewMaterialAdditions([row], latest);
  assert.equal(result.additions.length, 0);
  assert.equal(result.alreadySaved, 1);
});

test("batch recovery refuses same-ID conflicts, duplicate IDs and read-only turns", () => {
  const row = { ...edit.row, quantity: 1 };
  assert.throws(() => exports.reviewMaterialAdditions([row], { version: 8, readOnly: false, rows: [{ ...row, status: "ORDERED" }] }), /differs from your draft/);
  assert.throws(() => exports.reviewMaterialAdditions([row, row], { version: 8, readOnly: false, rows: [] }), /duplicate line IDs/);
  assert.throws(() => exports.reviewMaterialAdditions([row], { version: 8, readOnly: true, rows: [] }), /read-only/);
});

test("batch recovery enforces total capacity while allowing already-saved lines", () => {
  const row = { ...edit.row, quantity: 1 };
  const latest = { version: 8, readOnly: false, rows: Array.from({ length: 100 }, (_, i) => ({ ...row, id: String(i) })) };
  assert.throws(() => exports.reviewMaterialAdditions([row], latest), /exceed 100/);
  assert.equal(exports.reviewMaterialAdditions([latest.rows[0]], latest).additions.length, 0);
});
