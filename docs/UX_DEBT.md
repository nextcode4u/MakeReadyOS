# UX Debt

This list tracks approved usability work and remaining opportunities.

## Module Simplification TODO - 2026-10-02

Approved implementation queue. Track local implementation separately from browser
verification, deployment, and feedback from real use. Preserve existing permissions,
history, safety warnings, offline recovery, and advanced workflows.

- [x] Projects: simple title, product/vendor link, and estimated total entry; optional photos and advanced details; compact browsing with costs; edit saved basics; safe links.
- [x] Pool Log: actionable missing-log and review rows; direct daily-log entry, with property-scoped review filtering.
- [x] Vendors: on-demand creation ahead of existing lists, persistent vendor contact labels, save failures preserve the draft.
- [x] Property Wiki: compact category navigation with search and emergency access kept prominent.
- [x] Refrigerant: choose charge/recovery before showing a form; separate type setup from daily entry.
- [x] Lease Compliance: reduce top-level navigation, explain resolved versus archived, collapse optional capture.
- [x] Preventive Maintenance: due-now task landing for field staff and compact export controls.
- [x] Projects browsing: six readable overview metrics, simpler filters, collapsed details with task/file/comment counts; bids and detailed planning remain available.
- [x] Property Maps: map first, explicit expandable configuration.
- [x] On-call: sticky save controls, grouped settings, visible time-zone explanation.
- [x] Pest Control: active requests first; optional new-request form.
- [ ] Shared QA: keyboard/touch navigation, English/Spanish, narrow screens, create/edit persistence, permission and recovery regressions.

Start with Projects. A request such as "Dog stations" should need only a title,
an optional Amazon/vendor link, and an optional estimated total, not a photo,
quote, vendor registration, quantity breakdown, or schedule. Saving an estimate
does not approve spending, place an order, or record actual expenditure.

### Implementation Notes

Checked items mean implemented locally, not deployed or field-validated. The
product link is a nullable field added by a migration. HTTP(S) links without
credentials are accepted; the server never fetches product pages. Links survive
native backup/restore and appear in CSV/Excel exports and individual reports.
Estimated totals remain separate from approved quotes and recorded actual costs.
The simple editor protects against stale writes and preserves failed drafts.

### Automated Verification

Verified locally on 2026-10-02 under Node 24:

- `test.sh` passed, including builds, lint, production dependency audits, isolated regressions, and disposable database/API checks.
- Seven targeted browser tests passed: simple Projects create/edit and backup restoration; compact module navigation; Spanish controls; two On-call safety/sharing workflows; Pest Control copy/archive; and existing project quote, budget, schedule, and export workflows.
- Projects screenshots were inspected at mobile and desktop widths; inputs no longer share an unstructured inline row, and optional detail sections remain collapsed.
- The audit gate identified an existing Fastify advisory. Fastify was patched to 5.12.5; the subsequent production dependency audits passed.

These are targeted automated checks, not a complete accessibility audit or proof
of real-device field acceptance. No production deployment was performed.

### Remaining Follow-Through

- [ ] Deploy only after release authorization, then gather technician/manager feedback on real devices.
- [ ] Complete keyboard, screen-reader, and interrupted-save checks across every module, beyond the targeted automated scenarios.
- [ ] Consolidate remaining Pool Log export/setup navigation and group Wiki categories further if field feedback shows the compact selector is still hard to browse.
- [ ] Finish legacy English-only copy in Projects and On-call; new Projects inputs and compact Wiki/Lease navigation support English and Spanish.
- [ ] Audit older module browser tests for assumptions about always-open forms; keep test changes tied to intended navigation changes.
