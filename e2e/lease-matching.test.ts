import assert from "node:assert/strict";
import { test } from "node:test";
import { leaseIssueMatchesLocation } from "../apps/web/src/lib/leaseIssueMatching";

test("lease matches stay unit-specific, with a separate common-area fallback", () => {
  const unitIssue = { unitId: "1715", building: "1700", area: "Windows", isArchived: false, status: "Open" };
  assert.equal(leaseIssueMatchesLocation(unitIssue, { unitId: "1715" }), true);
  assert.equal(leaseIssueMatchesLocation(unitIssue, { unitId: "1701", building: "1700" }), false);
  assert.equal(leaseIssueMatchesLocation(unitIssue, { building: "1700", area: "Windows" }), false);
  const commonAreaIssue = { ...unitIssue, unitId: null };
  assert.equal(leaseIssueMatchesLocation(commonAreaIssue, { building: " 1700 ", area: "windows" }), true);
  assert.equal(leaseIssueMatchesLocation(commonAreaIssue, { building: "1700", area: "Patio" }), false);
  assert.equal(leaseIssueMatchesLocation(commonAreaIssue, {}), false);
  assert.equal(leaseIssueMatchesLocation(commonAreaIssue, { unitId: "1715" }), false);
  for (const status of ["Resolved", "Archived"]) assert.equal(leaseIssueMatchesLocation({ ...unitIssue, status }, { unitId: "1715" }), false);
  assert.equal(leaseIssueMatchesLocation({ ...unitIssue, isArchived: true }, { unitId: "1715" }), false);
});
