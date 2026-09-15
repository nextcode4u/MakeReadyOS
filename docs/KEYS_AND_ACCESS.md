# Keys & Access

Available from the key icon in the module rail, command search, Setup > Units,
and the lookup section in a unit's details.

- Admins, managers, technicians and leasing can look up codes in their accessible
  properties. Painters and cleaners require the per-user **Allow keycode viewing**
  checkbox in Admin (off by default). Viewers are always denied, even if a request
  tries to enable that flag. API tokens and public links cannot use this directory.
- Only admins/managers can edit the directory or import/export it. Assigned
  technicians continue entering resident codes through Work.
- The list does not contain code values. Reveal is an audited, non-cacheable
  request; values hide on leaving the browser tab or after two idle minutes.
- Codes are unit-specific door codes, resident access codes and key-cutting
  references. Never put staff/master codes here. Key-cutting references do not
  appear on the resident report.
- CSV/TSV import header: `unit,doorCode,accessCode,keyCode`. Any subset is valid.
  Blank cells preserve existing values. Explicit overwrite is required to replace
  codes. Preview shows the target property and affected units, never the codes.
  Unknown/duplicate/ambiguous units need correction or explicit skipping.
- Numeric units normalize leading zeros only when the match is unambiguous.
- JSON exports preserve exact strings and avoid spreadsheet formula execution.
  They can be reimported into the same property. Protect downloaded files as
  sensitive credentials; do not submit them to public conversion tools.
- Changes synchronize codes with current (unarchived) turn report drafts and
  invalidate stale draft edits and handoff confirmation. Archived reports retain
  historical values. Unit codes remain available even without an active turn.
- Native administrative backups include the directory. Existing units are not
  overwritten during merge restores; database backups also include the table.

## Painter role

On-site painters can receive assignments/planned work and update painting status
and notes, upload evidence, and complete checklists. They cannot finish the repair
stage or independently grant themselves final-walk approval. Outside contractors
can remain vendors; adding this role does not turn vendors into login accounts.

## Storage review (2026-09-15)

The production root filesystem was 36% used (37 GB of 109 GB), with 66 GB free.
Backups used 104 MB. Docker reported approximately 13.7 GB of reclaimable build
cache and 6.5 GB of reclaimable images; these figures may share layers and must not
be added as a guaranteed saving. No backups, volumes, images or caches were deleted.
Prefer a reviewed build-cache cleanup over deleting recovery data if space becomes
tight. Never prune volumes containing the database or uploads.
