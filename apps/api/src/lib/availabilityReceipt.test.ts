import assert from "node:assert/strict";
import { test } from "node:test";
import { availabilityReceipt } from "./availabilityReceipt.js";

const receipt = (metadata: unknown) => availabilityReceipt({ createdAt: new Date("2026-09-13T12:00:00Z"), metadata });
test("availability receipts distinguish recorded coverage from legacy unknown history", () => {
  assert.equal(availabilityReceipt(null), null);
  assert.deepEqual(receipt({ fullReport: true, reportDate: "2026-09-13" }), {
    importedAt: "2026-09-13T12:00:00.000Z", coverage: "UNKNOWN", reportDate: null, dateIssue: "UNKNOWN",
  });
  assert.equal(receipt({ receiptVersion: 1, fullReport: true, reportDate: "2026-09-13" })?.coverage, "FULL");
  assert.equal(receipt({ receiptVersion: 1, fullReport: false })?.coverage, "PARTIAL");
});
test("partial receipt dates remain independent of upload date and reject ambiguous dates", () => {
  assert.equal(receipt({ receiptVersion: 1, fullReport: false, sourceReportDates: ["2026-08-01", "2026-08-01"] })?.reportDate, "2026-08-01");
  assert.equal(receipt({ receiptVersion: 1, sourceReportDates: ["2026-08-01", "2026-08-02"] })?.dateIssue, "MIXED");
  for (const value of ["bad", "2026-02-31", 123]) {
    const result = receipt({ receiptVersion: 1, fullReport: true, reportDate: value, sourceReportDates: ["2026-09-13"] });
    assert.equal(result?.reportDate, null);
    assert.equal(result?.dateIssue, "INVALID");
  }
  assert.equal(receipt({ receiptVersion: 1, sourceReportDates: ["bad"] })?.dateIssue, "INVALID");
  for (const value of [null, [], "invalid", { receiptVersion: 2, fullReport: true }]) assert.equal(receipt(value)?.coverage, "UNKNOWN");
});
