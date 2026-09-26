# Spanish Interface Coverage

The English and Spanish core catalogs have matching keys and interpolation variables. Newer features must also pass the selected user's language into their nested components; catalog parity alone does not detect hardcoded English UI.

## Turn Workflow

The Spanish turn-workflow pass covers:

- Expanded/collapsed module navigation labels and accessible names.
- Unit work shortcuts, process help, correction cues, and reopening confirmations.
- Quantity-free work notes, parts pickup statuses, quick entry, and draft/conflict recovery instructions.
- Technician preparation checks, resident codes, mailbox warnings, and handoff counts.
- Final-walk assignment, backup inspector setup, approval instructions, and current readiness blockers.
- Inspection report editor controls and current technician/inspection checklist labels.
- Frog Pond team milestone names.

Fixed turn copy is in `apps/web/src/lib/turnLocale.ts`. The fixed API checklist labels and milestone names are translated for display only. Unknown server messages retain their original text rather than hiding details. Never translate or rewrite stored notes, names, part descriptions, custom checklist titles, status values, or codes based on the viewer's language.

## Remaining Coverage

This is not a claim that every module is fully localized. Remaining areas include the standalone On-call and Keys & Access workflows, the branding administration form, newer commercial/project controls, and some server-generated notification/error text. Resident PDF/HTML report wording remains the property's saved wording; switching the interface language does not change an issued document's language.

## Regression Checks

- `e2e/spanish-turn-locale.test.ts`: core catalog parity, placeholders, duplicate/missing turn-copy keys, current API checklist/milestone coverage, and readiness messages preserving user content.
- `e2e/mobile-spanish-turn.spec.ts`: Spanish work-note/parts saves, pickup status, preparation/code controls, and inspection editor at mobile and desktop widths using fictional isolated records.
- `e2e/mobile-turn-usability.spec.ts`: existing English turn navigation, drafts, help, and handoff behavior.
