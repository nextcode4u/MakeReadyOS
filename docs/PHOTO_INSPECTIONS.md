# Photo Inspections

MakeReadyOS uses the item drawer as the field documentation entry point for photos, files, and inspection notes. Uploads remain local-first and are stored in the configured uploads volume or path.

Supported upload types include JPG/JPEG, PNG, GIF, WebP, AVIF, HEIC/HEIF, BMP, TIFF, PDF, text/CSV, Word, and Excel files. Phone camera uploads are supported through the browser file picker. `MAX_UPLOAD_MB=0` disables MakeReadyOS' per-file API limit, and the bundled nginx container does not impose its own body-size limit. External reverse proxies, browser memory, available disk space, and mobile network conditions can still limit very large photo batches.

## Inspection Stages

Each attachment can be tagged with an inspection stage:

- General
- NTV / Notice
- Vacated
- Initial Walk
- Scope
- Trash Out
- Cleaning
- Paint
- Flooring
- Damage
- Final Walk
- Move-In Ready

Stages are intentionally broad. They support turnover documentation without forcing a property into one exact workflow.

## Image Notes And Charge Context

Each attachment supports:

- operational note
- category, such as damage, cleaning, trash-out, paint, flooring, appliance, keys/locks, resident items, vendor proof, or final QC
- charge-candidate flag
- charge/recovery note
- optional property price-sheet item, quantity, and estimated amount
- image markup pins with percent-based coordinates, label, category, optional charge-candidate flag, optional price-sheet item, quantity, and estimated amount

This is documentation and estimating only. MakeReadyOS can store property-specific price-sheet items and attach an estimated amount to charge-candidate evidence, but it does not create resident ledgers, invoices, vendor bills, or accounting entries.

## Drawer Workflow

In the item drawer:

1. Upload one photo/file or select many photos/files at once from desktop or mobile.
2. Use the compact drawer summary to see counts, recent thumbnails, and charge-candidate totals.
3. Open the Inspection Gallery for bulk review instead of crowding the drawer.
4. Filter the gallery by all files, files needing classification, a specific inspection stage, or charge candidates.
5. Add stage, category, notes, and charge context per image/file after upload.
6. Click an image/file card to open an in-app preview instead of downloading immediately.
7. On image previews, add markup pins for damage, cleaning, trash-out, vendor proof, or charge context without modifying the original file bytes.
8. Use per-file download buttons when the original file is needed.
9. Download all files, the current stage filter, charge candidates, or an individual category as a ZIP for handoff or evidence review.
10. Use the same drawer for comments, checklist progress, vendor work, and risk reasons.

The gallery pattern is intended for initial walks where 30-50 photos are common. The drawer stays operationally readable while the gallery handles inspection review and damage documentation.

Filtered ZIP downloads are generated from authenticated item attachment access. ZIP contents are organized by inspection stage and category. These ZIPs are convenience exports for unit evidence review; they are not a replacement for full upload-volume disaster recovery.

The evidence package panel highlights charge-candidate files and charge-candidate pins, flags candidates that still need pricing or notes, and totals estimates from both whole-photo charges and pin-level charges. Use `Download Charge ZIP` when you need a focused damage/charge packet without exporting every walk photo.

## Price-Sheet Estimates

Managers and administrators can add property-scoped price-sheet items from the Inspection Gallery. Each item can carry a name, category, unit label, and default estimate. Operators can then mark a photo/file or an individual image markup pin as a charge candidate, select a price-sheet item, set quantity, and override the estimated amount when the field walk requires it.

The estimate total shown in the gallery is a review aid for damage, cleaning, trash-out, and similar evidence packets. It is intentionally separate from accounting. Exported ZIPs contain the files; the database stores the structured estimate metadata, including pin-level price-sheet references.

`GET /api/make-ready-items/:id/charge-report` returns a scoped, read-only line-item summary of charge-candidate photos and charge-candidate markup pins. It includes file/pin labels, categories, notes, selected price-sheet items, quantities, per-line estimates, missing-context count, and total estimate. The Inspection Gallery exposes the same data through the “Open charge report” action. Use this report for internal review/export tooling; it is still evidence metadata rather than an accounting charge.

## Storage And Backups

Attachment metadata is stored in PostgreSQL. Uploaded file bytes are stored in the local uploads path or Docker uploads volume. Native MakeReadyOS JSON transfer is for operational data and does not include large upload bytes. Full disaster recovery requires both:

- PostgreSQL database backup
- uploads backup with `./backup-uploads.sh`

See `docs/BACKUP_AND_TRANSFER.md` and `docs/DISASTER_RECOVERY.md`.

Deployments that store a large volume of phone photos should mount the upload path to durable host storage. A NAS/Samba-backed mount is a reasonable deployment pattern when the app runs on a Raspberry Pi or small VM. Keep `UPLOAD_DIR=/app/uploads` inside the container and set `UPLOADS_HOST_PATH` to the host/NAS directory. Use `./move-uploads.sh` before switching an existing deployment.

The Admin storage screen shows the current upload path, validates proposed local/NAS paths, and generates the safe backup, dry-run, move, `.env`, and restart commands needed to relocate uploads. It also supports per-property subfolder routing for new photos/files, which is useful when a host path is backed by NAS, Samba, NFS, or OS-synced OneDrive storage. It intentionally does not silently remount Docker storage from the browser.

## Current Limits

- No resident charge ledger, invoice workflow, or accounting export.
- Price-sheet estimates are property-scoped and manually maintained; there is no bulk price-sheet importer yet.
- No OCR or automatic damage classification.
- No direct attachment-to-checklist-item relation yet; attachments are item-level.
- Markup pins are metadata overlays. They do not burn annotations into the original image file yet.
- No cloud storage dependency by design.
- Very large inspection sets should be uploaded in practical batches so mobile browsers do not exhaust memory before the server receives the files.
- If upload errors happen before MakeReadyOS can return a message, check any external reverse proxy body-size setting, tunnel/proxy timeout, browser memory pressure, and free space on `UPLOADS_HOST_PATH`.
