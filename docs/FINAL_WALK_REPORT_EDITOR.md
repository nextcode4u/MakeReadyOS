# Admin Final-Walk Report Editor

Local implementation, not deployed.

## Where To Open It

Setup > Properties > select a property > Branding > **Edit / Preview Final-Walk Report**. Save property/company logo changes before opening. The screen is admin-session-only; API tokens and other roles cannot use its endpoints.

The editor provides:

- Property-specific title, introduction, footer and accent color, with an explicit Save report settings action.
- Branding-only previews without choosing a unit. Both identities use the selected property's actual saved property logo, management company name and company logo. Missing branding remains visibly missing rather than substituting another property.
- A turn selector limited to active, non-archived turns in that property. Inspection drafts are tied to turn IDs, not just reusable unit numbers.
- 45 grouped checks based on the existing sample, with separate internet and valet-trash results. Checks start Not checked, including for board rows already marked ready. Checked, Needs attention and Not applicable are manually recorded; exceptions require a reason. Bedrooms/bathrooms cover every applicable room rather than numbered report rows.
- Existing generic checklist completion records as read-only reference. They are not silently converted into verified inspection results. Assigned tech/reviewer names are shown as assignments, not signatures.
- Inspection date, mailbox number, home/mailbox key counts, fob/remote counts, parking assignment and resident-facing follow-up. There are deliberately no access-code inputs; notes must not contain staff/master codes.
- Explicit Save inspection draft, Preview report and Download draft PDF actions. Previews include current unsaved form values; neither preview nor PDF implicitly saves them. Changing fields clears the old preview. Closing or changing turns prompts before discarding unsaved edits, and browser navigation receives a before-unload warning.
- Optimistic revisions and transactional locks reject stale settings/draft saves with 409. Reload saved data explicitly discards local edits after confirmation. There is no last-write-wins replacement of another admin's draft.

## Output And Data Boundaries

This is a **draft workspace**, not the independent finalized-inspection milestone. Every page is labeled DRAFT / NOT FINALIZED / NOT FOR RESIDENT ISSUE. Saving does not update work status, complete generic checklists, sign for another user, or mark a unit ready. A Checked result is an admin-entered draft result, not an independently verified signature or a safety certification.

The report uses two printed columns on Letter paper, bounded logos and escaped text. PDFs are rendered server-side with external resource requests blocked. If actual content exceeds one printable page, download returns 422 rather than clipping notes or dropping unresolved findings. Browser preview has its own scrollable page area; the server's measured PDF fit check is authoritative. This does not guarantee arbitrary 45 long exception notes can fit a page.

Drafts live in the separate `FinalWalkReportDraft` table so ordinary board API responses do not expose their handoff details. Property wording/style is in `PropertyBranding.finalWalkReportSettings`. PostgreSQL and native JSON backups preserve both, with import defaulting missing fields for older backups. Existing matching items/branding are retained under normal merge rules rather than overwritten. Draft edit audit entries record actor/turn/revision without copying handoff text into the audit log.

Migration: `20260907233000_final_walk_report_drafts`.

Endpoints:
- GET `/api/final-walk-reports/:propertyId?itemId=...`
- PUT `/api/final-walk-reports/:propertyId/settings`
- PUT `/api/final-walk-reports/:propertyId/items/:itemId`
- POST `/api/final-walk-reports/:propertyId/preview` (`html` or base64-encoded `pdf` response)

## Still Separate

Verified technician/independent reviewer sign-offs, immutable issued revisions, ready-status gates, secure household-only access codes, inspector-role editing and rework assignment remain in DIGITAL_TURN_WORKFLOW.md. The editor does not claim those are complete. New editor copy is English; Spanish localization remains a follow-up alongside the branding editor.

## Verification

Local API/web builds, lint, four domain/permission tests and the isolated Docker browser integration pass. Browser coverage includes actual saved logos, draft reloads, stale-edit conflicts, cross-property rejection, one-page PDF output, long-content rejection, mobile overflow and native backup/restore. No production records were changed; this feature has not been deployed.
