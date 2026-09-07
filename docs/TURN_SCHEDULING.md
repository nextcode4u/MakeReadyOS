# Guided Turn Scheduling

Open Automations and use **Put your turns on the calendar**. Advanced rule templates and imported packs are optional; they are not prerequisites for this guide.

1. Choose one property explicitly.
2. Confirm the weekday durations and preview proposed dates.
3. Enable scheduling and fill the calendar. The five included rules and tracks are enabled together.

The default sequence starts on the first eligible workday after the recorded Vacated date:

| Working Day | Stage | Stored Date |
| --- | --- | --- |
| 1 | Make Ready (Start) | Custom `turnMaintenanceDate` |
| 2 | Painting | Custom `turnPaintingDate` |
| 3 | Cleaning | Custom `turnCleaningDate` |
| 4 | Flooring repairs / carpet cleaning contingency | `flooringDate` |
| 5 | Expected Finish / final check target | `makeReadyDate` |

Each stage defaults to one working day. Stage durations are editable per property. The repair start is always the first eligible workday after Vacated, including when repairs need several days. Later stage targets accumulate the allotted durations from Vacated, not from potentially conflicting existing stage dates. The board's Expected Finish date remains the overall target, avoiding an overdue whole turn after only the first workday.

## Start And Finish Calendars

Schedule defaults to separate **Make Ready (Start)** and **Move-In** calendars. Select **Expected Finish** in either calendar or use the four-calendar layout to see all three together. Saved calendar selections are preserved.

The standard seed creates the repair-start DATE field and calendar even before automatic scheduling is enabled. It renames only known built-in legacy finish/start labels, preserving custom names, track IDs, archived settings, and all existing dates. A unit with only the old `makeReadyDate` appears under Expected Finish, not under Make Ready (Start). Set its start date manually using the custom date field or use the property scheduling guide to fill missing dates. No start dates are inferred by copying or subtracting from an existing finish date. No new database migration is needed.

The finish target is an estimate, not proof of a completed final walk. This change does not add move-in deadline enforcement or automatically reschedule a conflicting existing plan.

Setup enables no-weekend scheduling for the selected property and preserves its existing Monday/Friday exclusions. Five workdays normally fit seven calendar days; extra excluded weekdays extend that window. The current operating-calendar engine does not account for holidays or staff leave.

Missing source dates are listed for correction. Existing dates are preserved, including dates conflicting with the suggested sequence. Archived turns, inactive properties, and completed turns are excluded. Earlier vacate dates can produce overdue targets; this is not a catch-up rescheduler. Dates are plans, not completion marks, staff/vendor reservations, or capacity-checked Planning work blocks.

Setup creates the three managed custom date fields and enables the five shared Schedule tracks, while rules and item dates are scoped to the selected property. Archived/deleted or incompatible custom fields cause an actionable error rather than silent recreation. Repeating setup updates only this property's managed rules; it does not duplicate them. Pause stops the managed rules without removing dates. Retry after partial execution fills only remaining missing dates.

The API process checks enabled `guided-turn:` rules every five minutes. No separate cron setup is required for these rules. Shutdown stops the timer and waits for in-flight work. Legacy/specialty rules retain their existing scheduled-runner behavior and are not silently enabled. The manual scheduled runner can also execute these rules; item-level transactional rechecks and conditional custom-value writes protect existing dates during overlapping runs.

**Open Schedule calendar** selects this property's five tracks, clears other board filters, and opens the current month. Historical targets require navigating to their month.

Manager/admin API routes:

- `POST /api/automations/turn-setup/preview`: `{ propertyId, days: [1,1,1,1,1] }`; previews all matching turns, returning up to 25 unit details and full counts without writes.
- `POST /api/automations/turn-setup/enable`: same payload; atomically creates/reconfigures the pack and returns five rule IDs. The UI then runs those rules individually and reports incomplete execution honestly.
- `POST /api/automations/turn-setup/pause`: `{ propertyId }`; disables this property's guided rules only.

The structured engine also supports `setCustomDateFromField` for an active DATE custom field, a built-in source date, and an operating-day offset. Managed rules should be configured through the guide rather than the advanced editor.

## Percentage Turn Assignment

Use **Automatically split turns between your team**, below the calendar guide. Choose each property and add eligible people with percentages totaling 100, then enable the split. For example:

| Property | Manager | Site Tech |
| --- | --- | --- |
| VAB | 100% | Not selected |
| TA | 25% | 75% |

Each property's split is independent. Smooth weighted round-robin distributes new automatic assignments over time, not current open workload: a 25/75 split assigns one of each four turns to the first person and three to the second. Fractions cannot be exact for every small batch. Manual assignments and completed work do not reset the cycle. Changing shares starts a new cycle; saving identical shares, pausing/resuming, or restarting preserves the persisted credits.

Only unassigned, incomplete, non-archived turns with a recorded Vacated date on or before now and a recognized vacant/not-ready status are eligible. Explicit ready statuses, NTV, occupied, and unknown statuses are excluded. Legacy `VACANT`, `VACANT_NOT_LEASED`, and `VACANT_LEASED` remain eligible unless completed. Existing assignments are never redistributed. Older eligible vacate dates are processed first, in batches of up to 200 per run. The app runs enabled policies every five minutes independently of the calendar pack; enabling in the guide also runs immediately.

Selected users must be active, have an assignable role, and have property access (admins have global access). If anyone becomes unavailable, the whole split waits for correction rather than silently redirecting their percentage. Because the board still stores assigned names, selected people must have distinct, nonempty display names among eligible staff. Policies store user IDs, resolve current names when assigning, and audit each assignment with the user ID. Historical names are not renamed by this feature.

Property-level transaction locks serialize concurrent runs and settings edits. Each assignment, balance update, audit entry, and permitted in-app assignment notification commits together; notifications respect existing preferences and quiet hours. Item-level rechecks preserve assignments made while a run was waiting. Retry does not consume a second share for an already assigned turn. Pause preserves all existing assignments. Disable overlapping legacy assignment rules when adopting this policy: they can otherwise assign turns before this worker sees them. This is not staff availability, a workload cap, or a reserved Planning block.

Manager/admin routes, all property-scoped:

- `GET /api/automations/turn-assignment/:propertyId`: eligible staff, saved shares, enabled state, eligible-turn count, and unavailable-staff warning.
- `PUT /api/automations/turn-assignment/:propertyId`: `{ enabled, shares: [{ userId, percent }] }`; validates and saves the split. Does not assign until the next worker run or an explicit run.
- `POST /api/automations/turn-assignment/:propertyId/run`: assigns eligible turns with the saved policy and returns counts/warnings.

Migration `20260907040000_turn_assignment_policy` adds the per-property policy and persisted credits. PostgreSQL backups include both. Native JSON transfer does not yet include this configuration; reconfigure splits after a native transfer (which starts a new balancing cycle).

## Final Walk Inspectors

In Automations, use **Who does the final walk?** for each property. Add the primary inspector first, then backups in escalation order (for example, leasing, assistant manager, manager). Managers/admins configure the order; only active staff with property access can be selected. Named inspectors are independent of the repair tech assignment.

As requested, future scheduled dates do not create inspections. Assignment and an in-app notification happen when the turn enters **FINAL WALK**. Normal completion updates assign immediately; the five-minute worker also reconciles status changes from other paths. Notification preferences and quiet hours are respected. With no named inspector, the existing completion flow alerts managers/admins instead.

My Work shows **Final walk inspection** and **Inspect or hand off**. The drawer shows the inspector, target date, next eligible backup, and a required handoff reason. The current inspector or a manager/admin may hand off; the current inspector (including leasing) may sign off once the turn is in Final Walk. Handoff is transactional, audited, and rejects stale duplicate requests. Inactive/out-of-property backups are skipped. The chain never loops: at the end it leaves the current assignment in place and asks the user to contact a manager.

Each inspection snapshots its original order. Changing property settings applies to new inspections only; pausing stops new assignments without dropping existing ones. Signoff completes the inspection block; archiving or moving back out of Final Walk cancels pending inspection work during reconciliation. Planning controls cannot independently reassign or complete managed inspection blocks.

Migration `20260907060000_final_walk_assignment` adds policy storage and inspection-chain fields on existing planning blocks. PostgreSQL backups preserve this state. Native JSON transfer does not currently include planning blocks or these policies; use database backups for a complete restore.

### Inspection Follow-Up

- Add explicit manager replacement of an existing inspection chain when all backups are unavailable, preserving the audit trail.
- Include final walk policies/blocks in native transfer with destination-user mapping.
- Translate inspector-specific controls and add operational alerts for chains that become entirely ineligible after configuration.

## Other Follow-Up

- Extend percentage assignment with capacity limits, staff leave, vendor booking, conflict-aware rescheduling, and Planning work blocks without presenting tentative dates as confirmed bookings.
- Include assignment policies and balance credits in native JSON transfer with destination-user mapping; migrate board assignments from display names to stable user IDs.
- Add holiday/leave handling and timezone-specific calendar regression coverage.
- Translate the new guide and provide clearer run-health status without opening advanced history.
- Extend readiness exclusions for imported/custom completion labels and review how legacy ready inventory should participate.
- Native JSON transfer currently preserves raw automation custom-field IDs. Re-run this guide after moving to another database to bind its rules to the destination fields; audit and migrate custom-field references across all rule/template transfer paths. PostgreSQL backups preserve IDs.
- Re-evaluate persisted risk scores after scheduled date writes; existing derived overdue/date displays recalculate on reads, but risk materialization needs a separate audit.
