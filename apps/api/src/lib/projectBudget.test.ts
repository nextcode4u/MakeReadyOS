import assert from "node:assert/strict";
import test from "node:test";
import { projectBudgetSummary, projectCostInput, projectQuoteInput } from "./projectBudget.js";

test("project totals include selected scopes, not competing bids, and preserve unknown costs", () => {
  const result = projectBudgetSummary([
    { status: "Included", amountCents: 10001 }, { status: "Included", amountCents: 20000 },
    { status: "Received", amountCents: 90000 }, { status: "Declined", amountCents: 70000 },
    { status: "Included", amountCents: null },
  ], [
    { isArchived: false, quantity: 1.5, unitCostCents: 2501, actualCostCents: null },
    { isArchived: false, quantity: 2, unitCostCents: 1000, actualCostCents: 0 },
    { isArchived: true, quantity: 1, unitCostCents: 99999, actualCostCents: 99999 },
  ]);
  assert.deepEqual(result, { vendorEstimateCents: 30001, inHouseEstimateCents: 5752, plannedCents: 35753, unknownIncludedQuotes: 1, recordedInHouseActualCents: 0, unrecordedActualLines: 1 });
});
test("quote/cost validation rejects invalid money and requires named scope/company, but not a vendor ID", () => {
  const quote = { expectedVersion: 0, scope: " Roof ", companyName: " New vendor " };
  assert.equal(projectQuoteInput.parse(quote).companyName, "New vendor");
  assert.equal(projectQuoteInput.parse(quote).amountCents, null);
  for (const amountCents of [-1, .5, Infinity, 1000000001]) assert.equal(projectQuoteInput.safeParse({ ...quote, amountCents }).success, false);
  assert.equal(projectQuoteInput.safeParse({ ...quote, scope: " " }).success, false);
  const cost = { expectedVersion: 0, description: "Tech labor", category: "Labor", quantity: 2.5, unitCostCents: 3500 };
  assert.equal(projectCostInput.parse(cost).quantity, 2.5);
  assert.equal(projectCostInput.safeParse({ ...cost, quantity: 0 }).success, false);
  assert.equal(projectCostInput.safeParse({ ...cost, quantity: 100000, unitCostCents: 1000000000 }).success, false);
});
