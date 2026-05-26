# Automation Notes

## Observed Legacy Automation

One local monday-style formula example is available: a `Date Fail Safe` calculation. Its business logic is:

1. Report missing scheduling data if cleaning, make-ready, or ready dates are empty.
2. Flag a vacated date that occurs after downstream scheduled dates or after move-in.
3. Flag a move-in date that occurs before cleaning, make-ready, or ready dates.
4. Otherwise report that the dates are valid.

This is validation/highlighting logic; it does not prove that dates are automatically edited.

## Automation Patterns Supported By Workflow Context

These rules align with the visible board workflow and current product direction:

| Trigger or Calculation | Condition | Expected Outcome |
| --- | --- | --- |
| Schedule validation | Required turn dates missing or sequenced incorrectly | Flag the item for attention |
| Days vacant | A vacated date exists | Calculate elapsed vacancy duration |
| Move-in risk | Move-in approaches while work is incomplete | Highlight or notify |
| Overdue make-ready | Target date passes before completion | Flag overdue work |
| Vacancy transition | Move-in is scheduled before vacancy occurs | Represent leased/not-yet-vacant state |
| Specialty work | Major scope, serious pest issue, or flooring replacement | Require focused planning/date tracking |

## Engine Requirements

- Rules need a human-readable name, trigger, conditions, actions, enabled state, and run log.
- Derived warnings should identify why an item is flagged.
- Automated changes should be auditable and distinguishable from human edits.
- Rules should not silently erase manually entered operational context.

## MakeReadyOS Structured Foundation

The current in-app Automation workspace is deliberately constrained:

- Visibility: `ADMIN` manages global or property-scoped rules; `MANAGER` manages rules scoped to assigned properties and can inspect global rules.
- Triggers: make-ready item created, item updated, date field changed, status field changed, and scheduled check.
- Conditions: equals, not equals, in-list matching, empty/not-empty, date before/after, date before/after today, date within the next X days, and missing date. Scheduled rules may target active custom fields using type-compatible operators, including status option equality, boolean checks, date checks, and multi-select containment.
- Actions: set a built-in value, set a custom-field value, and add an activity/audit note. Existing seeded priority/note actions remain compatible for event rules only.
- Traceability: definitions have enabled/archive lifecycle state and executions produce event/manual/scheduled run-history records; management changes write audit records.
- Preview: authorized users can dry-run saved or draft rules against current in-scope units; previews return proposed actions without changing unit data and are recorded as preview activity.
- Scheduled evaluation: `./run-automations.sh` can be called by cron/systemd; matching activity notes are deduplicated during a configurable cooldown period. Preview, manual runs, and scheduled execution share the same active-field and select-option validation boundary.
- Templates: the in-app library packages common make-ready rules as safe structured definitions. Installation is explicit, creates an editable rule, and leaves it disabled unless enabled during installation.

Bundled operational templates cover overdue work, move-ins within seven days, missing make-ready dates, schedule-review/date fail-safe attention, pest follow-up, missing flooring scheduling after replacement selection, and major-scope priority. Pest follow-up requires an active `Pest Follow-Up Date` custom date field. The current date fail-safe template detects incomplete scheduling only; direct comparisons between two board date columns remain a later structured-engine capability.

The application validates these structures and never executes arbitrary JavaScript. Files under the local `reference/JS automations/` directory are interpretation sources for future rule mapping only.

## Open Questions

- Which validations should block completion versus only warn?
- Which rule outputs should notify people versus color/highlight the row?
- Are date offsets standardized, such as painting one day after make-ready?
- Which automations were configured in monday.com beyond the available date formula?
