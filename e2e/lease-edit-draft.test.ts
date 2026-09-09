import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeLeaseEditDraft, leaseEditDraftKey, parseLeaseEditDraft } from "../apps/web/src/lib/leaseEditDraft";

const draft = { baseUpdatedAt: "2026-09-09T12:00:00.000Z", values: { building: null, area: "Courtyard", assignedUserId: "staff" } };
test("lease drafts preserve explicit clears and their original server version", () => {
  assert.deepEqual(parseLeaseEditDraft(encodeLeaseEditDraft("a", "p", "i", draft), "a", "p", "i"), draft);
});
test("lease drafts cannot move between accounts, properties or issues", () => {
  const raw = encodeLeaseEditDraft("a", "p", "i", draft);
  for (const [user, property, issue] of [["b", "p", "i"], ["a", "q", "i"], ["a", "p", "j"]]) {
    assert.equal(parseLeaseEditDraft(raw, user, property, issue), null);
    assert.notEqual(leaseEditDraftKey(user, property, issue), leaseEditDraftKey("a", "p", "i"));
  }
});
test("lease drafts reject malformed, excessive and unsupported stored fields", () => {
  const envelope = { version: 1, userId: "a", propertyId: "p", issueId: "i" };
  for (const invalid of [
    { ...draft, baseUpdatedAt: "invalid" },
    { ...draft, values: [] }, { ...draft, values: {} },
    { ...draft, values: { propertyId: "outside" } },
    { ...draft, values: { area: "x".repeat(161) } },
    { ...draft, values: { building: "x".repeat(121) } },
    { ...draft, values: { status: "Unknown" } },
    { ...draft, values: { priority: null } },
  ]) assert.equal(parseLeaseEditDraft(JSON.stringify({ ...envelope, draft: invalid }), "a", "p", "i"), null);
  assert.equal(parseLeaseEditDraft("not json", "a", "p", "i"), null);
  assert.equal(parseLeaseEditDraft("x".repeat(16001), "a", "p", "i"), null);
});
