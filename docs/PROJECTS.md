# Projects And Recommendations

Projects is a first-class MakeReadyOS workspace for property-scoped recommendations, approved projects, lightweight project execution tracking, and location-aware operational follow-up.

It is intentionally positioned between a simple recommendation log and a full capital-project platform. The current foundation is designed for fast property operations, not procurement suites, accounting, or enterprise construction management.

## Current Scope

The workspace currently supports:

- Recommendations and Projects as separate record types
- Property-scoped categories
- Building, area, location notes, tags, company/vendor context, assigned role/user, and due/scheduled dates
- Source tracking for recommendations and projects
- Deferred-maintenance fields with reason, target year, and notes
- Budget-year planning fields
- Estimated cost and actual cost fields for lightweight budget visibility
- Automatic recommendation aging (`days open`) with age buckets
- Priority and execution type tracking
- Comments and simple project tasks
- Photo/document attachment uploads with categorized attachment types (`Before`, `Progress`, `After`, `General`, `Bid / Quote`, `Location`)
- Multi-photo upload with optional captions and mobile camera-friendly capture flows
- Photo-first `Quick Capture` flow with drag/drop staging, preview, remove-before-save behavior, lightweight property-walk capture loops, and browser-local offline queueing for record/photo sync retries
- Visual project/recommendation cards with faster dashboard scanning
- Simplified quick-capture defaults for `Recommendation` and `Project`
- Collapsed `More Details` advanced fields to reduce form overload
- Single-record PDF project summary reports and richer multi-project visual reports
- Dashboard visibility for recent project updates and recently added project photos
- Recommendation-to-project conversion
- CSV, Excel-compatible, and printable report exports
- Image-backed property map view for pinned records, selected-record detail, and direct pin repositioning
- Map view now honors the existing Projects search/source/budget/deferred/aging filters so teams can narrow visible pins without leaving the workspace
- My Work surfacing for directly assigned project records and project tasks
- Audit-log-backed lifecycle history on the record detail view

The current workspace tabs are:

- Dashboard
- Projects
- Recommendations
- Map View
- Bids / Quotes
- Archive
- Reports

## Permissions

Projects currently follows the existing role-derived access model:

- `ADMIN`: full access
- `MANAGER`: full scoped access
- `TECH`: scoped edit access with operational limits
- `LEASING`: read-only scoped access
- `VIEWER`: read-only scoped access
- `CLEANER`: no Projects workspace access

## Current Design Notes

This first pass keeps the data model extensible without pretending the whole operational layer is finished yet.

Current intentional limitations:

- Map view now uses the linked property map image/PDF context with selected-record detail, direct pin repositioning, and the same workspace filters used by the list views. It remains intentionally lightweight rather than becoming a full GIS or multi-layer construction-planning surface.
- Bids / Quotes now has a dedicated working view for records that need bids or already have bid activity, plus record-level vendor/contact/bid-status/bid-notes editing and quick actions such as request, received, approve, and deny. It is still intentionally lightweight and does not attempt side-by-side quote comparison or procurement workflows.
- Category management is available in-app on the Reports tab for admins, including add, rename, activate/deactivate, and color updates.
- Attachment metadata can be edited after upload from the record detail view, including caption changes and attachment-type reclassification.
- Quick Capture now falls back to a browser-local offline queue when the device is offline or the API is temporarily unreachable. Queued records and photo uploads sync automatically on reconnect and can also be retried manually from the Projects workspace.
- Property Wiki references are now surfaced directly in the project detail view through the shared workflow-context panel, including attached references, suggestions, known issues, emergency records, and related SOP/vendor/equipment/document matches.
- Recommendation creation from other modules is now partially wired end-to-end. Preventive Maintenance tasks, Pool Log entries, Property Wiki workflow cards, and Property Maps selected markers can open Projects quick capture with source/origin context prefilled. Future workflows can reuse the same event-based handoff pattern.
- Native backup/transfer now includes Projects categories, records, comments, tasks, attachment metadata, and Property Wiki reference metadata. Uploaded project file bytes still follow the standard upload-backup path and are not embedded in the JSON transfer file.
- Future module integrations should continue surfacing Projects context inside working screens instead of duplicating project data elsewhere.

## Backup And Portability

Native JSON transfer now includes Projects records, categories, comments, tasks, attachment metadata, Property Wiki reference metadata, and lightweight map placement fields. Uploaded project file bytes still follow the standard upload-backup path and are not embedded in the JSON transfer file.
