# Analytics And History

MakeReadyOS history is intentionally layered instead of duplicated.

## Unit History

`GET /api/units/:id/history` builds a unit timeline from existing operational records:

- make-ready item creation and archive events
- NTV/move-out, vacated, make-ready, and move-in dates
- audit/activity records
- comments and updates
- attachment uploads
- checklist task completions
- vendor assignment changes
- automation runs
- current persisted risk state

The endpoint also returns turn summaries for every make-ready item linked to that unit, including days vacant, turn duration, risk level, assigned tech, vendor work count, and checklist completion percentage.

The Setup-side unit history inspector now adds a compact review layer on top of that derived timeline:

- operational summary metrics for current turn, completed-turn count, average duration, average checklist completion, and latest event/completion
- event-source and event-type rollups for quick pattern review
- direct CSV export for turns and events plus JSON export of the full derived unit-history payload

## Daily Snapshots

`PropertyDailyMetricSnapshot` stores lightweight property-level daily metrics for trend reporting:

- active turns
- vacant
- NTV
- ready
- down
- overdue
- high risk
- average days vacant
- move-ins next 7 days
- completed turns count

Snapshots are upserted by property/date, so the runner is safe to execute multiple times per day.

## Runner

Run snapshot collection from the project root:

```bash
./run-analytics-snapshot.sh
```

The script is Docker Compose friendly, waits for API readiness, invokes the API container's compiled snapshot runner, and writes `logs/analytics-snapshot-YYYYMMDD-HHMMSS.txt`.

## API

- `GET /api/analytics/summary`
- `GET /api/analytics/snapshots`
- `POST /api/analytics/snapshot/run`
- `GET /api/units/:id/history`

All analytics routes respect property scope. Snapshot execution is restricted to `ADMIN` and `MANAGER`.

The summary response includes current turn metrics, completed-turn counts, property comparisons, 30-day snapshot trends, recurring issue signals, recent completed turns, risk level counts, risk category counts, stale-risk counts, and ready-date miss counts. Risk category data is derived from persisted item risk reasons so it stays compatible with existing board filters and item drawer explanations.

The dashboard now surfaces that data more directly instead of treating analytics as one small trend strip:

- sortable property-comparison rows for active, overdue, high-risk, and average-vacant-day review
- selectable 7 / 30 / 90 / 180 day comparison windows using fetched daily snapshots
- metric-specific property delta review for overdue, high-risk, active turns, average vacant days, and completed turns
- scope-level ready-date miss rows that show which work scopes are missing target make-ready dates most often
- recurring-hotspot cards that show cross-turn unit problem signals, active-vs-completed turn counts, checklist completion, average duration, and direct open/drill actions
- technician throughput rows that show who is closing turns, who is carrying active backlog, and who is also holding overdue work
- vendor throughput rows based on completed/open vendor assignments instead of only generic vendor-presence counts
- recent completed-turn shortcuts that jump straight into the underlying record
- dashboard-side CSV export of fetched daily snapshots
- dashboard-side JSON export of the current analytics summary plus fetched snapshot history

Property comparison average-vacant-day values are normalized per property instead of exposing summed day totals, so exported and in-app comparisons stay meaningful.

## Backup Decision

Daily snapshots are derived analytics. They are included in PostgreSQL disaster-recovery backups, but intentionally excluded from native JSON transfer for now. A destination instance can regenerate snapshots from its operational records.

## Current Limits

- Trend history starts only after snapshots are run.
- Unit history is derived from existing records and may not reconstruct field-level changes before audit coverage existed.
- Category-level SLA trend history is still foundational; technician and vendor throughput are now surfaced on the dashboard, and deeper reporting should keep building on these snapshots and timelines.
