import assert from "node:assert/strict";
import test from "node:test";
import { applicantHeaders, currentResidentHeaders } from "../apps/web/src/lib/importResidents.ts";

test("resident, applicant and database identifier columns are not interchangeable", () => {
  assert.ok(currentResidentHeaders.includes("residentname"));
  assert.ok(applicantHeaders.includes("preleasedname"));
  assert.ok(applicantHeaders.includes("futureresidentname"));
  assert.deepEqual(applicantHeaders.filter(header => currentResidentHeaders.includes(header)), []);
  for (const ambiguous of ["name", "residentid", "residentcode", "applicantid", "tenantid"]) {
    assert.equal(currentResidentHeaders.includes(ambiguous), false);
    assert.equal(applicantHeaders.includes(ambiguous), false);
  }
});
