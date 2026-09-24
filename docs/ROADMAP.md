# Roadmap

Reconciled 2026-09-23. Favor reliability, field usability and recovery over new modules. This is the current planning summary; dated audit entries retain historical evidence, not necessarily current deployment status.

## Release Status

- Latest recorded production release: `85b4164` (2026-09-23). This reconciliation does not perform a new production health check or deployment.
- Recent shipped improvements: guarded mailbox assignments (`e923bf2`); scope captured from Make Ready Status and need-to-know notification defaults (`6108fae`); searchable unit-code lookup, adjacent resident-code visibility control and editable preparation checks (`85b4164`). Preparation edits do not themselves change unit status; archived/inactive turns remain locked.
- Local, tested, not released: [on-call People removal safeguards](ON_CALL.md), including typed-name confirmation, referenced-person protection and Undo before save. Web build/lint and both on-call browser tests passed (`logs/e2e-20260923-182135.txt`).
- Local, verified restore fixes: unit-only imports resolve existing properties/floor plans and reject vanished references; disposable PostgreSQL tests confirm preview/apply parity, replay safety and rollback. Upload cleanup now stops on deletion errors and removes short hidden files. Release remains pending. See [Technical debt](TECH_DEBT.md#partial-native-unit-restores).
- Verification checkpoint: standard `test.sh` passed under Node 24 (`logs/test-20260923-190752.txt`), including isolated regressions, PostgreSQL/API checks, builds, lint and dependency audits. Stale pool-report, notice-to-vacant and down-unit/My Work fixtures were corrected. This is not a new browser/device validation; the existing bundle-size advisory remains.
- Real-device Web Push delivery remains a field-verification gate, separate from deployed push support and browser tests.

## Already Implemented

These are existing capabilities, not new-build TODOs. Implementation does not mean every edge case or field rollout is complete.

| Area | Existing capability | Remaining boundary |
| --- | --- | --- |
| Field work and offline | Cached reads, account-owned mutation/upload queues, supported comment/checklist/status/photo paths and retry/review controls | Recovery, conflict handling and unsupported secondary paths |
| Notifications | In-app alerts, device Web Push, contextual routing, category/property preferences, quiet hours and need-to-know defaults | Actual desktop/installed-phone delivery verification; optional digest |
| History and analytics | Unit timelines, turn summaries, daily snapshots, property comparisons, technician/vendor throughput and CSV/JSON exports | Completion provenance, scope consistency and deeper drill-through |
| Property setup | Property templates, schedule presets/compatibility hints, availability/directory imports and occupancy goals | Real-export validation and clearer import review/guarded undo |
| Integrations | Signed webhook queue, retry/backoff, timeouts, attempt logs and health diagnostics; token scopes, shared rate limiting and usage visibility | Generated OpenAPI schemas, evidence-driven event coverage and public-edge hardening |
| Transfer contracts | Published [library-pack schema](schemas/makereadyos-library-pack.schema.json) and [native-backup schema](schemas/makereadyos-native-backup.schema.json) | Contract/restore parity; verified partial-unit fix awaits release |
| Storage and scale | Admin upload/NAS inspection, backup/move helpers, server-side board filters, opt-in windowed loading, lazy workspaces and vendor chunks | Off-server recovery, migration rehearsal, bundle growth and large-board behavior |
| Planning | Scheduled work blocks, unscheduled work and staff/date views | Not a full capacity or drag-and-drop engine; hour-capacity UI is intentionally hidden |

Details: [Feature status](FEATURE_STATUS.md), [Offline implementation](../apps/web/src/lib/offlineSync.ts), [Push](PUSH_NOTIFICATIONS.md), [Analytics/history](ANALYTICS_AND_HISTORY.md), [Property templates](PROPERTY_TEMPLATES.md), [Webhook delivery](WEBHOOK_DELIVERY_PLAN.md), [Storage](UPLOAD_STORAGE.md), and [Planning](WORKLOAD_PLANNING.md).

## Active Priorities

The [Reliability and polish queue](RELIABILITY_POLISH.md) owns detailed acceptance checks; [Technical debt](TECH_DEBT.md) owns infrastructure gaps. These priorities summarize that work rather than creating a second independent checklist.

1. **Readiness consistency and signed reports.** Align import/create/override/reopen paths and cross-screen status rules. Finish durable technician/reviewer identities, independent sign-offs, immutable issued revisions and correction/recheck evidence. Existing final-walk drafts and PDFs are not a replacement for signed resident handoff records. See [Turn workflow audit](TURN_WORKFLOW_AUDIT.md).
2. **Photo, draft and offline recovery.** Preserve confirmed creates after subsequent upload failures, prevent duplicate replay after lost success responses, expose per-record pending/conflict states, and safely recover legacy ownerless jobs. Account ownership and supported offline queues already exist. Exercise unsaved navigation and late-response races across remaining edit paths.
3. **Backup and restore safety.** Rehearse coordinated database/uploads recovery, strengthen off-server protection, release the verified partial-unit and upload-cleanup fixes, and complete migration-only upgrade gates before removing compatibility fallbacks.
4. **Operational clarity and reporting.** Finish explicit painter/cleaner handoffs, readiness provenance, completion-date/scope consistency and report drill-through. Validate real imports and add safe review/undo. Extend existing Projects comparisons/reminders rather than rebuilding procurement. See [Projects follow-up](PROJECTS_WORKFLOW_AUDIT.md#follow-up-queue).
5. **Measured performance and accessibility.** Investigate the recurring main-bundle warning, remaining derived filters and large-board paging. Prototype virtualization only with sticky-group, inline-edit and batch-selection regressions. Continue keyboard/focus, touch-target, interrupted-save and theme QA.
6. **Field verification and release follow-through.** Release the tested on-call safeguards when authorized; verify push on target devices and need-to-know routing with real roles/preferences. A queued test is not proof an OS displayed an alert.

## Later Enhancements

Optional extensions, not missing foundations or current release commitments:

- Routine-notification digest beyond the shipped noise-reduction defaults.
- Richer week/whiteboard planning, capacity and unavailable-day constraints, and workload forecasting.
- Generated request/response OpenAPI schemas, more adapter examples and evidence-driven webhook coverage.
- Deeper historical SLA trends, resident/lease-aware risk and what-if planning without becoming an accounting system.
- Portfolio heatmaps, advanced map editing, broader search and cross-device pond discoveries.
- Additional library packs and declarative extension contracts. Arbitrary plugin code execution stays out of scope without a safe sandbox; `reference/` stays outside runtime paths.

## Status Maintenance

Record implementation, automated verification, deployment and field validation separately. Preserve dated audit evidence, but do not copy historical "local only" notes or superseded workflow rules into the active queue. Close only the completed portion of a task; keep remaining acceptance checks visible.
