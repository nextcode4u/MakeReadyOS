# Projects Workflow Audit

2026-09-14. Local implementation; not pushed or deployed. Production requires the additive `20260914120000_project_quotes_costs` migration and matching API/web images.

## Working Model

- A property recommendation can collect quotes before it becomes a project. Conversion retains the record and its documents.
- Add one quote per company and scope/phase. Attach several PDFs to the same quote, or create separate quotes for separately priced work.
- Only **Included** quotes contribute to the plan. Received, requested, declined and superseded alternatives remain available without inflating costs. Inclusion records a plan, not purchase authorization.
- A new company name does not require an existing vendor. Managers/admins can add the company to the selected property's Vendors directory inline, with its trade.
- Labor uses hours times hourly cost. Materials/equipment use quantity times unit cost. Actual cost is a separate line total. Blank actuals and unpriced included quotes are explicitly distinguished from zero.
- Original manually entered estimate/actual fields remain separate; they are not added to structured costs a second time. Dashboard and portfolio exports distinguish these figures.
- Project start/deadline dates are editable independently of individual quote response/expiry dates. Schedule and quote/cost edits detect stale versions.
- PDFs/images offer Preview and Download. All project files can be downloaded in one ZIP, with unique paths and a manifest retaining quote associations, uploader and upload date. Missing files abort the ZIP instead of silently omitting them. Limits: 1,000 files / 500 MB.
- Single-project printable/PDF reports include quotes, internal cost lines and document names. Portfolio CSV/Excel-compatible exports include structured subtotals and missing-price counts.
- Native JSON backups include quotes, costs, versions and document associations. Merge restores missing entries without overwriting existing ones; cross-project ID conflicts fail rather than relinking records. Native JSON does not contain file bytes: retain the separate uploads backup too.

## Defects Addressed

- Replaced the one-company bid model with individually identified, versioned quotes while retaining old bid/contact information.
- Fixed multipart field ordering so uploaded quote PDFs retain their BID classification and quote association.
- Replaced concurrent fire-and-forget file uploads with sequential processing and per-file outcomes. Uncertain outcomes tell users to check before retrying.
- Added cleanup for truncated or failed uploads and transactional attachment/audit creation.
- Removed draft resets caused by unrelated record refreshes; task/comment failures retain entered text.
- Prevented the old Request Bid action from placing a Project in a recommendation-only status.
- Included structured quotes in the Bids view even without a file or legacy company field.
- Hide cached details/budgets after access denial; retain drafts on transient refresh failures.
- Added a UUID fallback for local HTTP contexts and preserved session identity during asynchronous saves.
- Fixed the wrapping detail layout, narrowed the desktop record list, and connected undefined Projects color tokens to the app theme so cards and secondary actions have visible boundaries.

## Follow-Up Queue

- [ ] **P1: Durable upload receipts.** Add client upload IDs/checksums and safe retry/resume, including lost responses and interrupted large PDF batches. Current uncertain outcomes are explicit, not automatically retried.
- [ ] **P1: Complete legacy mutation concurrency.** Extend version/conflict handling to project status, tasks, comments and original bid/contact fields. Backend post-commit notification/audit failures must not imply that a committed change failed.
- [ ] **P2: Quote comparison and search.** Group alternatives by scope with a compact side-by-side comparison, search scope/company/reference, and allow attaching old ungrouped PDFs to a quote without re-uploading.
- [ ] **P2: Owner reminders.** Add configurable project deadline and quote response/expiry notifications, avoiding repeated alerts for closed/declined work. Dates currently display without a new reminder service.
- [ ] **P2: Vendor procurement details.** Optional contact/email/phone during inline vendor creation; duplicate-safe creation and matching; invoices, deposits and vendor actuals without double-counting estimates.
- [ ] **P2: Reduce advanced-field clutter.** Keep title, location, owner, deadline, quotes and costs prominent; move sourcing/budget-year/deferred-maintenance/map controls behind purposeful sections. Test recommendation capture through completion with each role.
- [ ] **P2: Native XLSX.** Replace the existing tab-separated `.xls` compatibility export with a real workbook including separate Quotes, Internal Costs and Documents sheets.
- [ ] **P2: Translation and recovery polish.** Translate new commercial/schedule controls into Spanish, add a visible restore action for removed cost lines, and persist unsaved quote/cost drafts per account/project.

## Verification

Focused pricing/property-scope tests, real-database browser workflow, report/ZIP downloads and native backup merge/restore are covered by `projectBudget.test.ts`, `projectAccess.test.ts`, `operationalReports.test.ts`, and `e2e/mobile-project-commercial.spec.ts`. Final run results are recorded in the reliability queue after verification completes. This is not a claim of a complete all-role Projects audit.
