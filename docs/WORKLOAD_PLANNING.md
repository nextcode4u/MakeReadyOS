# Workload Planning

MakeReadyOS workload planning is a lightweight supervisor layer for make-ready execution. It answers who is planned to work on which unit, when, and which move-ins still lack coverage.

## Models

- `WorkAssignmentBlock`: in-house planned work linked to a make-ready item, property, assigned user, category/trade, planned date, status, and notes. The schema still has legacy hour fields for compatibility, but the product UI intentionally does not use hour estimates.
- `UserCapacity`: legacy/future scaffold for trade categories and unavailable-day data. Hour-based capacity is not part of the current operating workflow.

This is not payroll, timeclock, or a full drag/drop scheduler. It is intentionally a make-ready planning foundation.

## Planning View

The `Planning` tab shows:

- planned assignments in the current planning window
- scheduled days and staff coverage
- unplanned active turns
- move-ins within the next week that have no in-house work block
- a fast form to create planned work blocks
- an unscheduled work bucket

`TECH` and other operational roles can view scoped planning data, but only `ADMIN` and `MANAGER` can create or replan work blocks. The assigned user can update limited execution fields on their own block.

## Board And My Work Integration

The item drawer shows an `In-House Planning` summary for the selected unit. `My Work` includes units assigned either through the existing assigned-tech field or through active planning blocks.

## Dashboard And Risk

Dashboard KPIs include planned assignments and move-ins not covered by planning. The risk engine adds planning risk when move-in is near, work remains incomplete, and no active in-house work block exists.

## Notifications

Creating or changing a work block creates in-app `PLANNING` notifications for the assigned user. Email, push, and realtime delivery remain future work.

## Limits

- No drag/drop calendar scheduler yet.
- Hour estimates and overloaded-day calculations are deliberately hidden because emergencies, parts, and vendor timing make them unreliable.
- Vendor assignments remain separate from in-house workload blocks.
- Forecasting is short-window and operational, not long-term staffing analytics.
