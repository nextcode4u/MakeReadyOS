# Roadmap

MakeReadyOS is currently a feature-rich self-hosted operations platform. The next phase should favor stabilization, polish, performance, and deployment maturity before adding more large modules.

## Near-Term Polish

- Refine dense table keyboard editing, column menus, and add-item flows.
- Improve item drawer collaboration polish: comment editing, attachment preview, checklist ergonomics.
- Tighten mobile My Work and drawer workflows for techs, cleaners, and leasing.
- Improve schedule track setup with presets and clearer field compatibility hints.
- Extend the new setup guide with deeper completion signals for filters, saved views, and board configuration.
- Continue light/dark/AMOLED/dyslexia/eye-strain visual QA.

## Stability And Performance

- Continue hardening versioned Prisma migration and rollback procedures.
- Prototype table virtualization without breaking sticky columns, group rows, add rows, or inline editing.
- Move more structured filters and pagination to the API for larger portfolios.
- Continue route/component code splitting as workspaces grow.
- Add API timing and frontend render diagnostics behind debug flags.
- Add an in-app read-only storage settings panel that shows current upload path, max upload size, and backup status without editing server environment variables.
- Rehearse restore flows on disposable databases before releases.

## Operational Depth

- Expand SLA/risk configuration by property, section, field, and move-in window.
- Add unit history timelines combining status changes, comments, attachments, vendors, checklists, and risk.
- Deepen vendor/contractor workflows with vendor performance and scheduling reports. Formal vendor compliance remains out of scope because most operators use separate compliance platforms.
- Add resident/lease awareness carefully without becoming a leasing/accounting system.
- Build operational/property templates for onboarding new properties.
- Deepen the Planning workspace into a richer week/whiteboard mode for upcoming move-outs, vendor planning, and workload balancing.
- Add unit-directory import/copy-paste workflows for property-management availability exports so properties can track total units, occupancy percentage, and target/budgeted occupancy goals.

## Integrations And API Ecosystem

- Expand the current `/api/openapi.json` baseline with generated schemas from route validation.
- Add API token usage analytics and stronger shared rate limiting for public deployments.
- Implement signed webhook delivery with queue, retry, timeout, and delivery attempt logs.
- Publish JSON schemas for operational library packs and native backup files.
- Add more examples for import adapters and reporting scripts.
- Keep arbitrary plugin code execution out of scope until a safe sandbox model exists.

## Analytics And History

- Add historical dashboards for turns completed, average days vacant, SLA misses, risk trends, and technician/vendor throughput.
- Track archived trends and make-ready aging over time.
- Add property comparison analytics across occupancy, readiness, backlog, and risk.
- Add schedule workload forecasting by week/trade/user/vendor.
- Add exportable analytics snapshots for owners/managers.

## Mobile And Offline

- Continue improving field workflow for photo upload, checklist completion, comments, and quick status changes.
- Expand weak-connection UX beyond the current offline/API retry banner into operation-specific retry states.
- Design offline queue/sync for comments, checklist changes, photos, and limited status updates.
- PWA install prompt is available for app-like launch; future work is true offline edit queues with explicit conflict handling.

## Plugin Ecosystem

- Expand operational library packs into a documented extension catalog.
- Add dashboard widget contracts without runtime code execution.
- Add import adapter contracts and validation flows.
- Add future plugin manifests only after security boundaries are explicit.
- Keep `reference/` out of runtime paths.

## Long-Term Advanced Ideas

- Property heatmaps and portfolio map layer.
- Advanced property map editor with buildings, floors, and zones.
- Frog Pond enhancements with more sprite packs, clustering, presets, and accessibility modes.
- Smart search across units, properties, vendors, comments, attachments, fields, and activity.
- Deepen real scheduling/workload planning across staff, trades, vendors, capacity, unavailable days, and move-in deadlines.
- Resident/lease-aware risk detection.
- SLA simulation and what-if planning.
- Optional external integrations after API/webhook hardening.
