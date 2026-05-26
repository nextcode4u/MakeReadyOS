# Feature Status Matrix

| Feature | Status | What Works | Remaining Gaps | Risk | Next Polish |
| --- | --- | --- | --- | --- | --- |
| Make-ready table | Stable | Dense grouped table, inline editing, batch actions, add rows, sticky identity columns | Table virtualization and deeper server filtering deferred | Medium | Large-data row rendering and keyboard polish |
| Custom fields | Stable | Types, options, values, table rendering, filters, saved views | Import/mapping UI not built | Low | Better field templates and validation UX |
| Saved views | Stable | Table/Kanban/calendar/dashboard states, shared views, visible columns | More conflict handling for changed/archived fields | Low | View ownership and duplication UX |
| Structured filters | Stable | Built-in and custom-field filters, active chips, dashboard drilldowns | Complex filter grouping is limited | Medium | Saved advanced filter builder |
| Kanban | Beta | Configurable grouping/coloring, drag/drop, saved config | More card density controls and lane ordering | Medium | Better mobile lane controls |
| Schedule/calendar | Beta | Configurable tracks, multi-calendar, legends, event drawer links | More schedule planning/workload logic needed | Medium | Track presets and conflict explanation |
| Dashboard | Beta | KPIs, charts, drilldowns, risk/vendor/map/Frog Pond panels, lightweight analytics trends | Trend history starts only after snapshot runs | Medium | Deeper historical analytics tables |
| Notifications | Beta | In-app notification records, badge, drawer, preferences | No email/push/realtime | Medium | Preference depth and notification routing |
| Activity/audit | Stable | Filtered admin/manager activity log | More entity-specific descriptions could improve clarity | Low | Better diff rendering |
| Item drawer | Beta | Full editor, comments, attachments, checklists, vendors, risk | Attachment preview/comment editing polish | Medium | Mobile attachment/comment refinement |
| Comments | Beta | Create/edit/delete-style operational updates | Mentions and threading not implemented | Low | Mentions and activity linking |
| Attachments | Beta | Local upload/list/download/delete with validation | No image preview/gallery or direct backup export bytes | Medium | Preview thumbnails and upload retention docs |
| Checklists | Beta | Templates, item instances, completion tracking | Due-relative rules and assignment are scaffold-level | Medium | Checklist assignment and required-item risk |
| My Work | Beta | Assigned operational card/list view | More role-specific quick actions needed | Medium | Tech/cleaner mobile flow polish |
| Workload planning | Beta | In-house work assignments, scheduled-day coverage, unscheduled bucket, My Work/drawer/dashboard/risk integration | No drag/drop scheduler, hour capacity intentionally hidden | Medium | Week planner and coverage forecasting |
| Command palette | Beta | Quick navigation/search/actions | Search ranking and keyboard actions are simple | Low | Better fuzzy matching and action preview |
| Automations | Beta | Structured rules, templates, property templates, library packs, compact section navigation, preview, manual/scheduled runs | No arbitrary JS by design; no notification channels | Medium | Rule explainability and more safe actions |
| Risk engine | Beta | Risk score/level/reasons, dashboard and drawer indicators | Historical risk trends and SLA config are limited | Medium | Configurable SLA thresholds |
| Analytics/history | Beta | Unit timelines, turn summaries, daily property snapshots, summary API, dashboard panel | Vendor/SLA analytics are still foundational | Medium | Trend drilldowns and exportable reports |
| Vendor system | Beta | Directory, assignments, schedule/risk/notifications | No portal, accounting, or communications | Medium | Vendor workload and compliance reports |
| Property maps | Experimental | Map uploads, unit markers, viewer/editor, dashboard counts | No GIS, layers are basic, image backup is external | Medium | Building/area heatmaps |
| Frog Pond | Experimental | Fun configurable visualization with selectable ponds, animated 32x32 sprite frames, draggable marker placement, tadpole swim motion, animation pause, and item drawer links | Achievement hats are copied but not yet unlocked by goals | Low | More sprite mappings, goal unlock rules, and shared/server-side pond presets |
| Operational library | Beta | JSON packs, preview/install, duplicate-safe behavior | Pack authoring UI and schemas can improve | Medium | JSON schema publishing and pack catalog |
| Roles/permissions | Stable | Admin/manager/tech/leasing/cleaner/viewer behaviors | Fine-grained field matrix remains broad | Medium | Per-property/per-field matrix UI |
| API tokens | Beta | Hashed tokens, scopes, property scope, admin UI, basic per-token rate limiting | No generated OpenAPI yet | Medium | OpenAPI and token usage analytics |
| Webhooks | Future | Endpoint registration scaffold | No delivery worker/retries/HMAC dispatch yet | Low now, High when enabled | Queue-backed signed delivery |
| Backup/restore | Stable | Native transfer, PostgreSQL dump/restore, retention helpers | Upload bytes require separate volume backup | Medium | Restore rehearsal docs and upload snapshot helpers |
| Themes/accessibility | Beta | Default/dark/light, AMOLED, dyslexia, eye-strain | Needs broad visual QA as UI grows | Medium | Accessibility regression checklist |
| Workspace navigation | Stable | Top-level views grouped by Operations, Visibility, Management, and Admin/Setup with role-aware tab visibility | More keyboard quick-switching could help power users | Low | Command palette workspace grouping |
| First-run onboarding | Beta | Browser-local admin/manager setup guide, automatic first-run open, skip/reopen behavior | Progress detection is intentionally simple and not server-synced | Low | Deeper setup completion signals |
| Deployment tooling | Stable | `doctor.sh`, Docker Compose docs, backup helpers, upload backup helpers, `reset-demo.sh` dry-run and confirmation safety | No automated rollback orchestration | Medium | Upgrade rehearsal checklist automation |
