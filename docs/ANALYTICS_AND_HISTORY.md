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

## Backup Decision

Daily snapshots are derived analytics. They are included in PostgreSQL disaster-recovery backups, but intentionally excluded from native JSON transfer for now. A destination instance can regenerate snapshots from its operational records.

## Current Limits

- Trend history starts only after snapshots are run.
- Unit history is derived from existing records and may not reconstruct field-level changes before audit coverage existed.
- Vendor performance and SLA analytics are foundational only; deeper reporting should build on these snapshots and timelines.
