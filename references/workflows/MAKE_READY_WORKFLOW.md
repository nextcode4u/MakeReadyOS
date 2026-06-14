# Make-Ready Workflow

## Purpose

This document captures the operational workflow visible in the legacy software-defined spreadsheet board without reproducing resident or unit-specific records. Raw screenshots and exports remain local reference material.

## Evidence Used

- Board screenshots showing grouped table and scheduling/calendar views.
- The exported workbook header structure.
- The legacy date-safety formula in `reference/JS automations/`.

## Observed Board Flow

The board follows an apartment-turn lifecycle:

1. A unit is placed into a make-ready working group when a vacancy or notice event needs tracking.
2. Dates establish the schedule: vacated, make-ready, painting, cleaning, ready, and move-in.
3. Trade/status columns track scope and completion for paint, doors, sheetrock, pest, trash out, flooring, cleaning, keys, and cabinets.
4. Techs can mark a turn complete when field work is believed finished; this moves the make-ready status to `FINAL WALK` and alerts supervisors.
5. Managers/admins perform the final walk/signoff before using the ready action that moves the turn into the property's Ready Units section.
6. Ready units remain visible for scheduling, leasing, and immediate move-in coordination.
7. Occupied/completed turns move to archive groups rather than disappearing from operational history.
8. Field execution needs short item updates, finish photos/documents, and repeatable checklists for handoff and final QC.

## Observed Grouping Pattern

The screenshots show separate operational groups for the two property sets, including ready units, active make-ready work, and archive history. A `Down & Models` group also captures units not in ordinary turn progression.

## Scheduling Behavior

- Calendar views are used for move-ins, make-ready dates, vacate dates, painting dates, and cleaning dates.
- Operators need to see schedule conflicts before a move-in is endangered.
- A move-in date can exist while the unit remains in a pre-vacancy or leased-not-vacant condition.

## Status Behavior

- Vacancy communicates whether a unit is occupied, vacant, leased, notice-to-vacate, or waiting for walk.
- Trade columns favor quick colored choices over prose.
- Completion depends on several work columns being acceptable, not merely on one final flag. The drawer should warn if common blockers remain, such as pest not being `NONE`, cabinets not being `GOOD`, or trash-out not being scoped/confirmed.

## Product Implications

- Preserve a dense grouped table as the fastest daily operations surface.
- Treat calendar and Kanban as alternate views of the same turnover record.
- Keep status labels configurable because properties may use different trade vocabulary.
- Preserve audit history when fields, dates, or completion states change.
- Keep comments and checklist completion inside the unit drawer so supervisors and technicians share one operational record without replacing table speed.
- Use `My Work` as the field-facing assigned-turn queue while managers retain the grouped table as the primary dispatch surface.
- Keep role responsibilities visible in the product: leasing updates notice/move-in/vacancy-facing data, cleaners update cleaning execution and checklist progress, techs update maintenance execution, managers coordinate property-scoped setup/automations, and admins control system-wide access.

## Not Yet Confirmed

- Exact rules for when a row changes group in every edge case.
- Whether all properties use identical label choices and date offsets.
- Who is responsible for each trade/status update in daily practice.
