# Unit Mailbox Directory

Deployed to mr-os.com in application release `5778f48` on 2026-09-07. Migration: `20260908010000_unit_mailbox_directory` adds nullable `Unit.mailboxNumber`. Availability and existing unit-directory imports leave mailbox assignments untouched. Native and database backups preserve them; native merge keeps matching existing units, as before.

## Setup

Under Setup > Units, choose **Unit directory property**, then open **Mailbox directory / import** alongside the availability and unit-directory imports. The property code/name stays visible above the preview and Apply button. Admins and property-scoped managers may import; API tokens and other roles cannot. This relocation and conversion prompt are local follow-up changes, not yet deployed.

Open **Conversion prompt / convert a spreadsheet, PDF or image** for a copyable, property-specific prompt. It requires two-column CSV, preserves leading zeros and source identifiers, excludes access codes/personal details, and asks for clarification rather than guessing. Clipboard failures select the visible prompt for manual copying. Changing the selected property resets the import text/preview and generates a prompt for the new property.

- Choose **Mailbox number matches unit number** to explicitly populate existing active units. This is a bulk action, not an inferred or permanent rule for future units.
- Otherwise upload/paste two-column CSV or TSV with `unit,mailbox` headers. Strings retain leading zeros; quoted CSV cells are supported. Do not include access codes.
- Preview is read-only. Unknown/ambiguous units and duplicate unit rows block Apply; import the unit directory first. Blank mailbox cells skip rather than erase assignments.
- Existing assignments are retained unless **Replace existing mailbox assignments** is checked. No unit creation, availability changes or cross-property matching occurs.
- Apply requires the preview token; changed mappings or property scope require a new preview. All mailbox writes share a per-property transaction lock and audit only actor/unit/count, not codes.

## Turn Details And Reports

Admins/managers can edit or clear a unit mailbox in Turn Details > Final-Walk Report / resident handoff, including a **Same as unit number** shortcut. A stale save is rejected. Admins can open the same report editor directly with this turn preselected.

New reports use **Unit mailbox directory (automatic)**. Each preview/PDF resolves the latest stored mailbox using the linked unit and property. Legacy unlinked turns only match an exact unit number in that property; no guessed matching. Missing assignments stay unrecorded. A report-only override never changes the unit directory.

Resident door/access codes belong to the individual turn draft, never the permanent unit directory. They start empty on other turns and print only with explicit resident-specific confirmation. Shared gate, staff, vendor and master codes must not be entered. Drafts remain unsigned and not for resident issue. See FINAL_WALK_REPORT_EDITOR.md for storage and backup limitations.

## Verification

API/web builds, lint and eight combined mailbox/report domain and permission tests passed. Isolated Docker browser checks passed in `logs/e2e-20260907-202754.txt`: property-targeted import preview/apply, leading zeros, stale-preview rejection, cross-property write rejection, unknown-unit blocking, Turn Details report entry, automatic mailbox population, opt-in resident codes, one-page PDF, mobile containment and native backup/restore. Production data was not changed.

Production deployment: database backup `makereadyos-db-20260907-203121.dump` and upload backup `makereadyos-uploads-20260907-203122.tgz` verified before migration; previous images retained as `rollback-b47399a`. Live mailbox field, preselected turn report, masked code inputs, PDF download, mobile layout and read-only TA import preview passed. No production assignments or inspection drafts were saved by smoke testing.
