# Product Overview

## What MakeReadyOS Is

MakeReadyOS is an open-source operations app for property maintenance teams managing unit turns, move-ins, and property service workflows.

## MVP Focus

The initial milestone is deliberately narrow:

- replace the current make-ready board workflow first
- preserve the speed and density operators rely on
- keep deployment simple enough for small internal teams
- make the board feel like an operations surface, not just a CRUD table
- make the board pleasant and reliable enough for all-day use on desktop and mobile

## Intended Users

- property managers
- leasing staff
- maintenance supervisors
- maintenance technicians
- cleaners and turnover vendors using scoped field workflows
- operations staff

## Why It Exists

Many teams use generic project tools for make-ready work. Those tools are flexible, but they are not purpose-built for apartment turnover operations. MakeReadyOS is meant to provide:

- purpose-built field structure
- operational visibility
- table, Kanban, and calendar workflows over the same work items
- reusable saved views for common daily operations
- saved table layouts with role-focused visible-column presets
- configurable make-ready columns with colored status choices and inline values
- manageable built-in status choices and property-scoped floor plans
- dense table-first layout with a browser-local compact mode for high-volume laptop operation
- local Default/Dark/Light themes plus optional dyslexia and eye-strain reading modes that preserve compact operations density
- polished operator UX with fast feedback, clear states, and mobile-safe layouts
- self-hosted deployment control
- admin-operated native JSON backup transfer between MakeReadyOS instances
- in-app audit visibility for managers and administrators
- constrained in-app automation management for repeatable workflow rules
- safe prebuilt automation templates for common make-ready risks
- safe scheduled checks for date-driven risk without a permanent background service
- long-term extensibility for other maintenance logs
- field collaboration through item updates, staged photo inspections, local attachments, and reusable turn checklists
- lightweight vendor/contractor tracking for outside flooring, pest, paint, cleaning, HVAC, and general work
- local property maps with building/area markers, unit markers, mapped/unmapped setup tracking, visual navigation, and future risk/status heatmaps
- active SLA/risk scoring so managers can see move-in failure risk, aging turns, missing critical dates, unassigned work, pest/flooring/paint risk, checklist risk, stale activity, and date conflicts

## Configurable Columns

Managers and administrators can add make-ready columns without changing application code. The first foundation supports text, numeric, date, boolean, status/select, multi-select, and future assignee-oriented fields. This allows the board to absorb property-specific operating details while preserving a consistent core turnover model.

Table users can include, exclude, and drag-order active custom columns alongside built-in columns and store that layout in a saved view. Every configurable table header has a compact manager/admin menu for renaming, resetting built-in presentation labels, hiding, ordering, sorting, and opening relevant option/floor-plan controls. Built-in and custom labels remain bound to stable internal keys used by data and rules. The `Item` identity field remains visible in every table layout. An item details control and Kanban cards open a right-side operational inspector for deeper edits and item history without displacing the grid as the daily work surface.

Advanced Filters includes active custom-field predicates with controls fitted to the field type: text containment, numeric comparison, date/range/window checks, status and multi-select options, boolean state, and assignee selection. Custom filters are stored in saved views, displayed as removable named chips, and apply consistently to Table, Kanban, and Schedule; archived field definitions are retained for history but no longer offered for new filtering.

The table remains the operating surface: managers and administrators can manage standard/custom choices and property floor plans from table popovers instead of leaving an active turnover review. Renamed choices migrate recorded matching values so pills, legends, exports, and backups retain one meaning.

Legacy spreadsheet exports are useful reference material for future mapping work; full legacy import is intentionally outside the current milestone.

## Backup Transfer

Admins can export versioned native JSON packages and merge them into another MakeReadyOS instance after a dry-run preview. This workflow preserves board configuration, comments, and checklist completion records without transferring users, passwords, sessions, deployment secrets, or local uploaded-file bytes. CSV remains a reporting export rather than a migration format.

## Field Collaboration

The item inspector contains concise operational updates, authenticated local attachment upload/download, staged inspection metadata, and checklist instances created from manager-defined templates. Updates are intended for handoffs such as vendor scheduling, finish-work completion, or final QC rather than general chat. Photo/file stages support NTV, vacated, initial walk, scope, trash-out, cleaning, paint, flooring, damage, final walk, and move-in-ready evidence. Bulk photo uploads are reviewed in a dedicated inspection gallery so a 30-50 photo unit walk does not crowd the drawer. Gallery cards open an in-app preview first, with markup pins for damage/charge context, explicit per-file downloads, and filtered ZIP exports for evidence handoff. Each file can carry a category, charge-candidate flag, image/file note, charge/recovery note, property price-sheet estimate, and non-destructive image pins for damage, cleaning, trash-out, and vendor proof documentation without creating an accounting module. Admins can route new upload files into property-specific subfolders inside the configured upload volume, which helps NAS/Samba/OneDrive-backed deployments keep evidence organized by property. `My Work` gives technicians a mobile-friendly list of assigned turns, attention flags, checklist progress, and quick make-ready status updates while retaining the dense table for desktop coordination. A Ctrl/Cmd+K palette opens units and saved views or switches operational surfaces quickly.

MakeReadyOS also seeds a practical make-ready QA paper workflow for teams that still need physical unit sheets. `Make Ready QA - Resident Front Sheet` is intended for a completed-unit sign-off that can be left in the unit, while `Make Ready QA - Internal Scope & Follow-Up` is for maintenance/office handoff and can be discarded after the durable notes/photos/checklist state are captured digitally. The internal workflow starts with a blue painter's tape scope pass: tape marks areas of concern in the unit, written notes on the tape identify parts/sizes/actions, and all tape should be pulled before the unit is marked ready. See [MAKE_READY_QA_CHECKLIST.md](MAKE_READY_QA_CHECKLIST.md).

## Activity Visibility

Administrators can review all recorded application activity, including authentication and native transfer actions. Managers receive a read-only activity view limited to records tied to properties they can access. Filters and paging make daily review practical without exposing unscoped security records to operational roles.

Database backup and restore scripts are disaster-recovery tools rather than user actions in the web app. Their execution trail stays in timestamped `logs/` files.

## SLA / Risk Visibility

The Dashboard surfaces critical/high risk counts, move-in risk, aging turns, missing dates, risk by property, and risk by assigned tech. Risk cards drill into the table with structured filter chips. The table, Kanban, Schedule, My Work, and item drawer all show explicit risk labels and reasons so attention flags are not communicated by color alone. Managers/admins can tune property risk-policy thresholds for move-in windows, stale work, aging turns, vendor timing, checklist timing, and planning coverage without changing stable risk categories. Current risk is persisted on each item for performance and backup parity; daily analytics snapshots now provide the first lightweight risk and overdue trend foundation.

## Analytics And Unit History

Unit history is available from the item drawer and unit-history API by deriving a timeline from make-ready lifecycle dates, audit/activity records, comments, attachments, checklist completions, vendor assignments, automation runs, and current risk state. Turn history is derived from make-ready records linked to the unit, so prior turns can be summarized without duplicating operational source data. The Setup workspace Archive / Occupied History panel exposes active/archive/all turn views with search, turn counts, key dates, and direct item-detail links for post-move-in lookup. A script-friendly snapshot runner records property/day rollups for average days vacant, completed turns, overdue work, high-risk counts, and move-in windows.

## Workload Planning

The Planning workspace gives supervisors a lightweight weekly view of in-house work assignments, scheduled coverage days, unplanned active turns, and move-ins that are not covered by scheduled work. Managers and administrators can create and replan work blocks by item, staff member, category, date, and notes. Hour estimates are intentionally hidden because emergencies, parts, and vendor timing make exact capacity math unreliable. My Work includes active planning blocks for field users, and the item drawer shows an in-house planning summary next to vendor work.

Operating calendars add property-level scheduling guardrails for no-weekend work, optional Monday/Friday avoidance, maintenance operating hours, vendor lead time, daily scheduled-unit limits, scope-day patterns, and work-start preferences. These settings are visible in Setup and transfer between MakeReadyOS instances. Current automations can warn and log review items, and explicit structured date-offset actions can populate downstream built-in date fields while respecting the operating calendar.

## Vendors And Contractor Work

The vendor foundation tracks active/archived vendors, trade/category, contact information, preferred status, property service areas, basic insurance/license expiration dates, and assignments linked to make-ready items. Vendor assignments carry scheduled/due dates, status, notes, optional cost/reference fields, and are visible from the Vendors workspace and item drawer. Vendor dates can be shown as Schedule tracks; Dashboard and Risk include vendor overdue/follow-up/blocked-work signals. Native backup includes vendor records and assignments, but MakeReadyOS does not include accounting, payments, vendor portals, email, or SMS.


## Unit Directory And Occupancy

MakeReadyOS now separates permanent unit inventory from active make-ready turns. Properties can store an occupancy goal percentage, and units can carry directory-level occupancy states such as occupied, vacant ready, vacant leased, NTV, NTV leased, down, model, and unknown. Building, area, and floor metadata support both simple unit-only properties and larger communities with irregular building numbering. The Setup workspace includes merge-style paste/file import for comma-delimited or tab-delimited unit directories and availability reports, with a preview before writing. Sparse files are safe: a unit directory can contain only unit number, floor plan, and square footage, and missing columns will not wipe existing unit metadata during updates. The Dashboard shows occupancy percentage, goal, total units, occupied units, vacant ready stock, and availability-report counts. Completed turns still belong in each property Archive section for later history review after move-in.

## Property Maps And Unit Directory

The Maps workspace lets authorized operators upload local property map images/PDFs, place building/area/floor markers, place or drag unit markers using percentage coordinates, track building/area/floor metadata, and open active make-ready item drawers from markers. Marker color can follow risk level, vacancy status, board section, assigned tech, or make-ready status, with a generated legend. The unit directory keeps unmapped units visible so setup gaps are clear. Native backup includes map metadata and marker locations; uploaded map files remain in local storage and are handled by disaster-recovery volume backups.

## Frog Pond Visualization

Frog Pond is a whimsical but data-driven view over the same permission-scoped make-ready records. Operators can choose what frogs represent, group by property/section/risk/tech, color frogs by risk/vacancy/make-ready/property, choose from committed pond backgrounds, cap visible frogs for performance, pause animation when needed, and open the shared item drawer from any item-backed frog. Frog sprite sheets are cropped to 32x32 frames rather than rendered as whole sheets; group counts live in the legend/summary instead of floating over the pond. It is intentionally local-preference based at this foundation stage and does not replace the table or dashboard.

## Structured Automations

Managers and administrators can review workflow rules, create property-scoped rules, toggle enabled state, archive definitions, and inspect recent runs. Administrators can additionally manage global rules; managers may read global behavior but change only rules within their assigned properties.

The first builder intentionally exposes a small vocabulary: item/date/status triggers, field/date conditions, and safe actions to set fields or add activity notes. It does not execute JavaScript or convert legacy scripts directly.

Preview mode lets an authorized user test a saved rule or an unsaved draft against current board items before enabling it. It shows affected units and proposed actions, records that a preview occurred, and makes no operational data changes.

Scheduled checks cover time-driven risks such as overdue work, nearby move-ins, missing dates, and property-specific custom status/date fields. The builder adapts operators and input choices to each custom field type, so status options and date logic can be configured without unsafe expressions. Operators schedule the supplied runner through Linux cron/systemd or execute an enabled rule from the workspace. Repeated matching activity notes use a cooldown so periodic checks remain useful rather than noisy.

An operational template library reduces setup time for common workflows. Admins and managers can preview and install templates for overdue work, imminent move-ins, missing dates, schedule-review warnings, pest follow-up, flooring scheduling, weekend schedule guards, vendor lead-time reminders, scope-day planning, date-sequence review, daily schedule load review, in-house/vendor routing review, ready-unit stock expectations, and major scope. Installed templates become regular editable rules and remain disabled unless the operator explicitly enables them. Templates that depend on a missing custom field show the setup step instead of silently installing incomplete logic.

Operational Library packs broaden setup beyond single automation templates. A pack can bundle reusable fields, labels, checklists, schedule tracks, saved views, and disabled automations for categories such as Make Ready, Leasing, Cleaning, Flooring, Paint, Pest, Scheduling, Risk/SLA, Notifications, and Reporting. Bundled packs appear in the Automation workspace alongside rule templates, property templates, rules, and run history, with compact section navigation to keep the page readable as the library grows. A JSON import box supports preview/install of external pack files. Packs are previewed before install, duplicate-safe, and data-only; imported JavaScript is never accepted.

Property templates extend that setup model to full property configuration. Admins and managers can save board sections, option sets, custom fields, floor plans, schedule tracks, shared views, dashboard presets, checklist templates, and disabled automation rules from an existing property, then dry-run apply the template to another property. Templates intentionally exclude live turns, residents, comments, attachments, users, tokens, sessions, and history.

## Dense Operations Layout

The daily board prioritizes visible operational rows over oversized application chrome. A unified toolbar keeps navigation, property selection, search, export, session controls, and local display preferences within reach without overlapping board controls. Compact Mode reduces desktop spacing in tables, Kanban lanes, and filters while retaining focus treatment and mobile-friendly controls. Theme and accessibility preferences persist in the browser: `Dark` is an AMOLED-style black palette distinct from balanced `Default`, and `Light` uses readable warm high-contrast surfaces. Eye-Strain mode softens the selected theme instead of replacing it; Dyslexia mode uses the OFL-licensed OpenDyslexic runtime assets committed under `assets/fonts/opendyslexic/` while preserving compact density when enabled.

Weak-connection handling is intentionally conservative in this release. The web UI detects browser offline state and API reachability failures, shows a retry banner, and avoids pretending edits are safely queued. Full offline sync for comments, checklist changes, photos, and status updates remains future work because self-hosted deployments need explicit conflict handling and upload retry semantics.

## Workspace Organization And Onboarding

The top navigation is grouped by operational intent instead of one long tab row: Operations, Visibility, Management, and Admin. Role-based visibility is preserved, so field users do not see admin-only surfaces.

Admins and managers can open the setup guide from the toolbar. On a new instance with no properties, the guide appears automatically and walks through property creation, unit/floor-plan setup, staff roles, property templates, starter automations, schedule tracks, saved views, Dashboard, and Frog Pond. It is a local browser guide, not a hard server workflow, so operators can skip it and reopen it later.

The old saved-view/filter sidebar has been removed from the primary board layout to reclaim horizontal working space. A narrow left module rail remains for MakeReadyOS and future placeholders such as PestLogOS, RefrigerantLogOS, PropertyWikiOS, and PoolLogOS. Small-screen users receive a compact board-card scan view with selectable items before the full spreadsheet grid, while Kanban remains a horizontally scrollable workflow surface.

## Property And Unit Setup

The `Setup` workspace lets authorized operators maintain properties and units and start a new turnover from an active unit. Properties, units, and make-ready items use archive/restore workflows so operational history is retained. Administrators control property creation and archival; managers manage units and turnover records only within assigned properties.

Setup also manages standard colored board options and reusable floor plans by property. Floor-plan cells and the item inspector select managed plans rather than editing uncontrolled text; selection synchronizes linked unit beds, baths, square footage, and description context. Existing freeform values remain explicitly marked `LEGACY` until mapped. The table surface includes a fast `+ Add item` row at each group: entering a unit number creates the turn in that section and creates the unit if needed. Protected bulk actions now include moving selected turns between board sections and selecting an active staff assignee rather than typing a name.

## Schedule Planning

The schedule surface treats `NTV / Notice to Vacate` as the expected move-out notice track and `Vacated` as the vacancy date track. Built-in tracks also include Make Ready, Move-In, and Flooring. Setup lets managers/admins use presets for common tracks, then create, rename, enable/disable, archive/restore, reorder, filter, group, and set risk cues for tracks. Color can derive from status, scope, a selected managed/custom option field, a fixed color, or a neutral fallback, and the legend follows the active configuration. Each active calendar panel also shows compact compatibility guidance for risk cues, weekend items, crowded days, high-risk work, and property operating-calendar conflicts in the current filtered month, while affected calendar days get visible badges for weekend, Monday/Friday, crowded-day, high-risk, and overdue conditions. Active custom date fields can supply Painting, Cleaning, Pest follow-up, vendor dates, inspections, or other property-specific schedule tracks without adding hardcoded modules.

Local preferences preserve a balanced Default theme, a true-black AMOLED Dark theme, a warm readable Light theme, independent Eye-Strain adjustments, OFL-licensed OpenDyslexic rendering in Dyslexia mode, and a browser-local 12-hour/24-hour timestamp display preference. Light theme QA covers dense calendars, activity/admin tables, setup forms, status pills, warning banners, and item-drawer surfaces so contrast remains usable during daily operations. All runtime font assets are committed under `assets/`; local `reference/` files do not ship with or drive the app.
## Dashboard And Daily Visibility

The Dashboard supports the spreadsheet workflow rather than replacing it: permission-scoped KPI counts, vacancy/scope donuts, readiness ratio strips, workload and property percentages, visible freshness time, a Frog Pond preview, and drilldown controls lead back to exact board slices, maps, or the operational item inspector. Drilldowns set structured filter chips for operational conditions such as vacant leased, NTV, down/ready/archive sections, assignee workload, move-in windows, overdue work, missing dates, specialty work, and risk. Operators can also filter directly from the table surface without starting from Dashboard. Vendor compliance expiration is intentionally out of scope for MakeReadyOS because that belongs in dedicated compliance systems such as NetVendor. Operators can combine slices with typed custom-field filters, save a dashboard overview/focus preset, and receive the same filtered records in Table, Kanban, Schedule, and Frog Pond. The Alerts inbox provides read/dismiss visibility and in-app category preferences for assignments, comments, checklist activity, status/date changes, lifecycle transitions, section moves, batch effects, and automation warnings; email, push, and realtime delivery remain future work.

Properties expose renameable `Ready Units`, `Make Ready`, `Down Units`, and `Archive` section labels while stable internal group keys remain durable. Archive is a real property-scoped section for completed move-in history, and the board toolbar can switch between active work, archive-only history, and combined troubleshooting views. Kanban is metadata-driven across built-in status/date fields, property/floor-plan/assignee values, and compatible custom fields; safe drag writes remain limited to authorized editable lanes. Schedule supports dense single, split-two, grid-four, and responsive auto track layouts with event-derived legends and drawer-opening events. Month grids use a Sunday-first operational layout, visibly mark the current day, and mute past days so supervisors can scan remaining work without losing historical context.

Property Maps remain local and self-hosted. Unit markers open the shared item drawer, and building/area summaries are derived from the unit directory so teams can see mapped versus expected units by building without forcing every property into the same numbering model.

## Scale Readiness

Growing inbox and drawer history results are bounded, the board API supports scoped incremental query parameters, and database indexes target common operational lookups. Uploads are format-validated and remain authenticated/property-scoped. An opt-in `./seed-large.sh` utility creates realistic synthetic turns for non-production load checks without slowing ordinary demo seed operation. Dense table virtualization remains deferred until measured workloads justify its interaction complexity.

## Integrations

Admins can create scoped API tokens for reporting adapters, import tools, operational scripts, and partner integrations. Tokens can be limited by capability scope and property. The Integrations panel also records webhook endpoints for future signed event delivery.

The supported extension model is intentionally safe: JSON library packs, documented API usage, native backup files, and scaffolded webhook metadata. Runtime plugin execution is not supported yet.
