# Keys & Access

Available from the key icon in the module rail, command search, Setup > Units,
and the lookup section in a unit's details.

- Admins, managers, technicians and leasing can look up codes in their accessible
  properties. Painters and cleaners require the per-user **Allow keycode viewing**
  checkbox in Admin (off by default). Viewers are always denied, even if a request
  tries to enable that flag. API tokens and public links cannot use this directory.
- Only admins/managers can edit the directory or import/export it. Assigned
  technicians continue entering resident codes through Work.
- Search the unit picker by unit number or key tag (case-insensitive). Tags are
  labels for shop keys, separate from key-cutting references. Matching results
  show the unit and tag; shared tags can match more than one unit.
- The authorized list includes key tags but not code values. Reveal is an audited, non-cacheable
  request; values hide on leaving the browser tab or after two idle minutes.
- Codes are unit-specific door codes, resident access codes and key-cutting
  references. Never put staff/master codes here. Key-cutting references do not
  appear on the resident report.
- CSV/TSV import header: `unit,doorCode,accessCode,keyCode,keyTag`. Use any subset
  of units and columns, with `unit` and at least one value column required.
  For tags alone, upload `unit,keyTag`; `Key Tag` and `key_tag` also work.
  Column order can vary. Existing four-column files remain supported.
  Blank cells preserve existing values. Explicit overwrite is required to replace
  codes or tags. Preview shows the target property and affected units, never the codes.
  Unknown/duplicate/ambiguous units need correction or explicit skipping.
- Numeric units normalize leading zeros only when the match is unambiguous.
- JSON exports preserve exact strings and avoid spreadsheet formula execution.
  They can be reimported into the same property. Protect downloaded files as
  sensitive credentials; do not submit them to public conversion tools.
- Door/access code changes synchronize with current (unarchived) turn report drafts and
  invalidate stale draft edits and handoff confirmation. Archived reports retain
  historical values. Unit codes remain available even without an active turn.
  Tag-only changes do not change resident report codes or handoff confirmation.
- Native administrative backups include the directory. Existing units are not
  overwritten during merge restores; database backups also include the table.

## Painter role

On-site painters can receive assignments/planned work and update painting status
and notes, upload evidence, and complete checklists. They cannot finish the repair
stage or independently grant themselves final-walk approval. Outside contractors
can remain vendors; adding this role does not turn vendors into login accounts.

## Storage maintenance

Prefer a reviewed build-cache cleanup over deleting recovery data if space becomes
tight. Never prune volumes containing the database or uploads.
