# SLA / Risk Engine

MakeReadyOS includes a structured SLA/risk foundation so the app can surface operational attention without relying only on raw board statuses.

## Risk State

Each make-ready item stores the current evaluated risk state:

- `riskScore`: numeric 0-100 score.
- `riskLevel`: `NONE`, `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
- `riskReasons`: structured reason objects with category, level, score, and readable message.
- `lastRiskEvaluatedAt`: timestamp for the last persisted evaluation.

Risk is persisted for board speed, native backup parity, and dashboard/filter consistency. Dashboard summaries may also evaluate live item state so newly changed data is represented even before the next explicit evaluation.

Items in a property's Ready Units section are forced to `riskLevel = NONE` and `riskScore = 0`. Ready Units is manager-approved stock, so unfinished-turn risk no longer applies after final walk signoff.

Daily analytics snapshots preserve property-level high-risk and overdue counts for trend reporting after `./run-analytics-snapshot.sh` runs. The snapshots are derived rollups, not the source of truth for current risk.

Planning risk is evaluated from active `WorkAssignmentBlock` records. Move-ins inside the near-term window with incomplete work and no active in-house work block receive a `PLANNING_RISK` reason. Hour/capacity overload detection is intentionally not exposed in the current UI because make-ready work changes too quickly for reliable hour estimates.

## Categories

Initial risk categories are:

- `MOVE_IN_RISK`
- `OVERDUE_MAKE_READY`
- `MISSING_CRITICAL_DATES`
- `UNASSIGNED_WORK`
- `PEST_RISK`
- `FLOORING_RISK`
- `PAINT_RISK`
- `CHECKLIST_RISK`
- `STALE_ACTIVITY`
- `DATE_CONFLICT`
- `PROPERTY_WORKLOAD`
- `VENDOR_RISK`

## Rule Examples

The evaluator is structured TypeScript logic, not user-provided JavaScript. Current checks include:

- move-in within 1 day and cleaning incomplete becomes `CRITICAL`
- move-in within 3 days and make-ready incomplete becomes `HIGH`
- overdue make-ready date with incomplete work becomes `HIGH`
- missing critical schedule dates becomes `MEDIUM` or `HIGH` near move-in
- missing assigned tech near move-in becomes `HIGH`
- active pest status becomes `HIGH`
- replacement flooring without flooring date becomes `HIGH`
- incomplete required checklist items near move-in becomes `HIGH`
- stale incomplete item activity after 5 days becomes `MEDIUM`
- move-in before make-ready date becomes `CRITICAL`
- long-vacant incomplete turns increase property workload risk
- open vendor follow-up, overdue vendor due dates, or open vendor work near move-in become vendor risk

## APIs

- `GET /api/risk/summary`: scoped rollup by level, category, property, assigned tech, and top risk items.
- `GET /api/risk/items`: paged scoped risk item list with optional level/category filters.
- `POST /api/risk/evaluate`: admin/manager evaluation that persists current risk state and can create deduped notifications.

All routes respect existing property permissions. Evaluation is manager/admin only; scoped users can read risk through the same board/dashboard visibility they already have.

## UI Integration

Risk appears in:

- Dashboard KPI cards and risk-level chart
- dashboard drilldowns into structured table filters
- table unit column risk pill
- Kanban card marker
- Schedule event context/legend priority
- My Work item marker
- Item drawer risk section with explicit reasons

Risk indicators include text labels and are not color-only.

## Notifications

When evaluation detects an item newly reaching `HIGH` or `CRITICAL`, MakeReadyOS can create deduped in-app notifications for admins, assigned-property managers, and the assigned staff member. Dedupe keys prevent repeating the same item/level notification every evaluation run.

## Current Limits

- Property-scoped risk policies now expose safe threshold configuration for move-in windows, stale activity, aging turns, vendor timing, checklist timing, and planning coverage. The category names and internal field keys remain stable for filters, dashboards, automations, exports, and history.
- Historical risk trend depth is still foundational. Daily snapshots track high-risk counts, while category-level trend and SLA-miss history need additional snapshot fields later.
- Property workload risk is item-level in this foundation; portfolio-level coverage modeling is future work.
- Risk logic remains structured TypeScript only. Property policies change thresholds, not executable rules.
