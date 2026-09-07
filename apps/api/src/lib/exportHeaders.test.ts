import assert from "node:assert/strict";
import { test } from "node:test";
import { customExportHeaders } from "./exportHeaders.js";

test("custom CSV headers preserve distinct labels without overwriting built-in or duplicate fields", () => {
  const fields = [
    { id: "a", label: "unitNumber" },
    { id: "b", label: "Inspection" },
    { id: "c", label: "Inspection" },
    { id: "d", label: "Unique field" },
    { id: "e", label: "unitNumber [custom:a]" },
    { id: "f", label: "__proto__" },
  ];
  const headers = customExportHeaders(fields, ["unitNumber", "notes"]);
  assert.equal(headers.get("d"), "Unique field");
  assert.equal(headers.get("a"), "unitNumber [custom:a] (2)");
  assert.equal(new Set(headers.values()).size, fields.length);
  assert.ok(![...headers.values()].includes("unitNumber"));
  assert.deepEqual(headers, customExportHeaders([...fields].reverse(), ["unitNumber", "notes"]));
  const row = { unitNumber: "101", notes: "Original", ...Object.fromEntries(fields.map(field => [headers.get(field.id)!, field.id])) };
  assert.equal(row.unitNumber, "101");
  assert.equal(row.notes, "Original");
  for (const field of fields) assert.equal((row as Record<string, string>)[headers.get(field.id)!], field.id);
});
