# Property Wiki

Property Wiki is a property-scoped knowledge base for operational site information. It is intended to answer four recurring questions quickly:

- Where is it?
- What is it?
- Who handles it?
- What do we need to know?

The module is intentionally operational rather than encyclopedic. It favors fast lookup, phone-friendly editing, and lightweight uploads over nested page trees or formal publishing workflows.

## What It Tracks

- Property overview profile:
  - address
  - unit count
  - building count
  - office phone
  - after-hours phone
  - property manager
  - maintenance supervisor
  - regional manager
  - general notes
- Utilities entries:
  - title
  - category
  - location description
  - notes
  - tags
- Access control entries:
  - title
  - category
  - location
  - equipment model
  - notes
  - tags
- Pool reference entries:
  - pool or equipment title
  - category
  - pool/spa capacity notes
  - pump/filter/heater models
  - controller notes
  - chemical target notes
- Equipment registry entries:
  - equipment name
  - category
  - optional building
  - location
  - manufacturer
  - model
  - serial number
  - install date
  - warranty expiration
  - notes
  - documents/photos
  - tags
- Unit standards entries:
  - floor plan
  - unit type
  - filter sizes
  - blind sizes
  - HVAC, water heater, appliance, paint, countertop, cabinet, and flooring notes
  - general notes
  - documents/photos
  - tags
- Property contacts:
  - contact type
  - name
  - title
  - phone
  - email
  - emergency marker
  - active/inactive state
  - notes
- SOP library entries:
  - SOP title
  - category
  - optional building
  - markdown/plain-text steps
  - related contacts
  - related vendors
  - related equipment
  - attachments/photos
  - tags
- Known issues entries:
  - optional building
  - title
  - issue description
  - recommended action
  - status: Active, Resolved, Archived
  - documents/photos
  - tags
- Emergency procedures:
  - title
  - situation
  - steps/content
  - contacts
  - attachments
- Custom pages:
  - title
  - category
  - markdown/plain-text style content
  - tags
- Property wiki vendors:
  - vendor type
  - company name
  - contact information
  - emergency phone
  - notes
- Shared asset library:
  - documents
  - photos
  - linked optionally to a wiki page or vendor

## Sections

The current top-level Property Wiki tabs are:

- Overview
- Utilities
- Access Control
- Pools
- Equipment Registry
- Unit Standards
- Property Contacts
- SOP Library
- Known Issues
- Vendors
- Documents
- Photos
- Emergency
- Custom Pages
- Search

Search spans entries, vendors, assets, and profile notes within the user’s allowed property scope. It now includes equipment names, model and serial values, floor plans, filter sizes, contact names and phone/email values, SOP steps, notes, tags, and uploaded asset metadata.

## Overview And Search

The overview page is now intended as the fast-entry surface for the module. It includes:

- property selector
- large search input
- favorites
- recently viewed
- pinned knowledge
- recently updated records
- emergency contacts
- common categories
- quick-add actions for utilities, equipment, vendors, contacts, SOPs, documents, and photos

## Workflow Integration

Property Wiki now includes an integration layer so property knowledge can surface inside active workflows instead of only inside the dedicated Wiki workspace.

Current integration points:

- Make Ready item drawer:
  - attached Wiki references
  - smart suggestions
  - floor-plan and unit-standard matches
  - related SOPs, equipment, vendors, and documents
  - known-issue warnings
- Pool Log:
  - pool equipment, SOP, vendor, and emergency references from the pool workspace
  - attachable Wiki references for saved pool-log records
  - known-issue warnings and emergency quick access
- Refrigerant:
  - unit/equipment-related SOPs and known issues surfaced from the Refrigerant workspace
  - attachable Wiki references for saved refrigerant transactions
- Dashboard:
  - lightweight Property Wiki widget for pinned knowledge, emergency contacts, and recent updates

### Workflow References

The integration layer uses lightweight references rather than duplicated content.

- Supported persisted workflow reference targets:
  - make-ready items
  - refrigerant transactions
  - pool-log entries
- Each reference stores only:
  - workflow record type/id
  - wiki record type/id
  - property scope
  - creator and timestamp
- Opening a workflow-linked reference routes the user back into the main Property Wiki workspace and record detail.

### Smart Suggestions

Workflow suggestions are intentionally lightweight and property-scoped. Related-content ranking now prefers direct links, exact building/category matches, shared tags, and strong title/company/model token overlap before falling back to looser text matches.

They rank Wiki content using available context such as:

- property
- floor plan
- unit number
- building
- facility name
- tags
- equipment or free-text hints

This currently favors operational speed over complex knowledge-graph behavior.

## Emergency Mode

Property Wiki now includes a dedicated Emergency Mode view for fast read-only access during incidents. Managers and admins can explicitly mark eligible records for emergency visibility. The view is intended to surface items such as:

- emergency contacts
- water and gas shutoffs
- fire-panel references
- gate or pool controls
- emergency vendors

The implementation stays lightweight: it uses explicit emergency flags plus existing record types rather than a separate publishing or approval system.

## Favorites And Recently Viewed

- Favorites are personal per-user and do not affect other users.
- Recently viewed is also per-user and currently keeps the latest 20 opened Wiki records.
- Supported favorites include applicable records, vendors, documents, and photos.

## Record Detail

Wiki records now have a lightweight detail panel that exposes:

- the current record summary
- related SOPs, equipment, vendors, documents, photos, and known issues
- recent human-readable change history from the existing audit trail

This is intentionally not a full document browser or version-history system.

Pinned knowledge remains property-specific. Managers and admins can pin or unpin records; viewers and other read-only roles can see pins only.

## Permissions

Current access follows the requested operational split:

- `ADMIN`: view, edit, admin
- `MANAGER`: view, edit
- `TECH`: view, edit
- `LEASING`: view
- `CLEANER`: view
- `VIEWER`: view

All access is still property-scoped by the normal `UserPropertyAccess` model.

## Audit Behavior

Wiki profile, entry, vendor, and asset records store normal created/updated timestamps. Mutations also write normal MakeReadyOS audit-log events with the authenticated user as actor.

No manual “technician selected by” field is required for wiki records.

## Uploads

Property Wiki documents and photos use the same routed local upload storage system as the rest of MakeReadyOS.

- Files are stored in the configured upload root.
- Property-specific subdirectory routing is respected.
- The current implementation accepts common image formats, PDFs, office docs, plain text, and markdown/plain-text notes.

## API Surface

The OpenAPI contract at `GET /api/openapi.json` now includes the main Property Wiki integration surface, including overview, profile, entries, vendors, assets, search, workflow context, workflow references, and record-detail endpoints.

## Current Limits

- Native backup export/import now includes Property Wiki entries, vendors, asset metadata, emergency/building fields, related-entry/vendor links, and workflow references.
- Per-user favorites/recent-view state remains intentionally local to each instance because native transfer excludes users and other personal state.
- Inspection workflow integration intentionally uses the make-ready drawer and inspection-gallery context. MakeReadyOS keeps inspection evidence attached to the turn record instead of introducing a separate persisted inspection entity.
- Refrigerant Wiki context now surfaces directly from the live Quick Charge / Quick Recovery form selections while still remaining available on saved refrigerant history views.
- Uploaded file bytes are not embedded in native JSON transfer, consistent with the rest of MakeReadyOS uploads.
- There is no page-tree hierarchy, version-history browser, approval flow, or external publishing surface.
- Search is intentionally simple and optimized for operational lookup rather than full-text indexing at enterprise scale.

## Intended Usage

Property Wiki is best used for:

- shutoff locations
- gate/controller notes
- emergency reference procedures
- pool equipment reference
- local vendor contact lists
- manuals, site maps, and quick-reference photos

It is not intended to replace:

- accounting systems
- formal document-management systems
- regulatory recordkeeping platforms
- asset lifecycle or work-order platforms
