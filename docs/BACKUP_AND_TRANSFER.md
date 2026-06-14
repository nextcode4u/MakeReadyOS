# Backup And Transfer

MakeReadyOS native backup files move operational configuration and board data between MakeReadyOS instances. They are versioned JSON packages, separate from CSV reporting exports.

## CSV Versus Native Backup Versus Disaster Recovery

- CSV export is intended for reports, spreadsheets, and review outside MakeReadyOS.
- Native backup JSON is intended for transfer to another MakeReadyOS installation.
- PostgreSQL dumps created with `./backup-db.sh` are intended for complete database disaster recovery after host or database loss.
- Native import accepts `.json` MakeReadyOS backup files only. It does not accept legacy spreadsheet exports or reporting CSV exports.

Native transfer intentionally omits credential and audit data. It is not a substitute for a full PostgreSQL backup. See [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) for database backup and restore operations.

Attachment/photo/property-map bytes are also outside native JSON transfer. For full instance movement or disaster recovery, pair the database dump with `./backup-uploads.sh` and restore with `./restore-uploads.sh` after the database restore.

Native transfer includes property risk-policy threshold configuration because it is reusable operational setup. It still excludes generated daily analytics snapshots; destination instances can regenerate snapshots from their transferred operational records.

Upload bytes can live in Docker's managed `uploads_data` volume or a host/NAS path configured with `UPLOADS_HOST_PATH`. Use `./move-uploads.sh <absolute-host-path>` before switching an existing deployment to host-mounted storage. Properties may also route new uploads into property-specific subfolders inside that active upload path; native JSON backup preserves the routing metadata but still does not embed file bytes. If older root-level files should be physically reorganized after enabling routing, use `./route-existing-uploads.sh` for a dry run, then `./route-existing-uploads.sh --apply` after confirming an upload backup exists.

## Format

The native backup JSON Schema and a minimal portable example live at:

- [`docs/schemas/makereadyos-native-backup.schema.json`](schemas/makereadyos-native-backup.schema.json)
- [`examples/native-backup/minimal-backup.json`](../examples/native-backup/minimal-backup.json)

The first supported package format is:

```json
{
  "format": "makereadyos.backup",
  "version": 1,
  "exportedAt": "2026-05-24T12:00:00.000Z",
  "source": {
    "app": "MakeReadyOS",
    "schemaVersion": "prisma-v1"
  },
  "data": {
    "properties": [],
    "floorPlans": [],
    "boardOptions": [],
    "boardColumns": [],
    "scheduleTracks": [],
    "operatingCalendars": [],
    "units": [],
    "makeReadyItems": [],
    "customFields": [],
    "customFieldOptions": [],
    "customFieldValues": [],
    "savedViews": [],
    "automationRules": [],
    "checklistTemplates": [],
    "comments": [],
    "vendors": [],
    "vendorAssignments": [],
    "refrigerantTypes": [],
    "refrigerantCylinders": [],
    "refrigerantTransactions": [],
    "refrigerantLeakFlags": [],
    "propertyMaps": [],
    "unitMapLocations": [],
    "propertyTemplates": [],
    "propertyMapAreas": [],
    "checklistInstances": [],
    "notes": []
  }
}
```

References are portable rather than database-ID based. Properties use property codes; floor plans use property code plus stable floor-plan code with plan-name fallback for older backups; managed board options and built-in display columns use stable field keys; schedule tracks use stable built-in keys or portable custom field keys; operating calendars use property codes; custom field values use field keys plus make-ready item portable keys; and custom columns in saved views use field keys during transfer.

## Included Data

- Properties and units
- Property-owned managed floor plans and unit mappings
- Managed built-in board label/status options, including archived historic choices
- Built-in display column labels, configured schedule tracks, and property operating calendars for scheduling guardrails such as no-weekend rules, edge-day avoidance, operating hours, vendor lead days, daily load caps, and scope/work-day preferences
- Make-ready board items
- Custom field definitions, options, and values
- Shared saved views
- Automation rule definitions
- Operational library install history is not required to run the app; installed library items export through their normal fields/options/views/checklists/automation records
- Checklist templates and checklist items
- Item operational comments/updates and checklist instance completion state
- Attachment/photo metadata is preserved by PostgreSQL backups. Local uploaded file bytes require an uploads backup and are not embedded in native JSON transfer files.
- Vendor directory records and vendor assignments linked to make-ready items
- Refrigerant types, virgin/recovery cylinder metadata, unit charge/recovery transactions, final recovery records, and repeated-addition leak flags
- Property map metadata, building/area markers, and unit marker locations
- Property/board template metadata and manifests
- Property notes

## Excluded Data

- Users and property-access assignments
- Passwords and password hashes
- Sessions, session cookies, and CSRF tokens
- Audit history and automation execution logs
- Daily analytics snapshots; they are derived history and can be regenerated on the destination with `./run-analytics-snapshot.sh`
- In-house workload planning blocks are currently excluded from native transfer because users are not transferred; PostgreSQL disaster-recovery backups preserve them.
- Operational library source/import manifests by default; re-import library packs separately when pack provenance matters
- External refrigerant system credentials or regulatory account credentials; MakeReadyOS stores operational refrigerant logs only
- Pool/spa setup and log records are included in native JSON transfer: facilities, chemicals, chemistry targets, daily log entries, safety checks, and chemical additions. Pool attachment metadata is database-backed, but uploaded pool-related photo/PDF file bytes are still upload-volume data, not embedded JSON.
- Live records inside property templates, such as make-ready items, comments, attachments, unit history, users, sessions, and tokens
- Environment files, secrets, and deployment configuration
- Uploaded attachment/photo/map file bytes; move the local upload volume separately with `backup-uploads.sh`/`restore-uploads.sh` for full continuity

Users are excluded in version 1 so the destination administrator explicitly creates accounts and access permissions rather than transferring authentication material. Personal saved views are also excluded because they have no safe destination owner without user transfer.

Property charge price-sheet configuration is included because it is reusable operational setup. Per-photo attachment records and uploaded bytes remain outside native JSON transfer; use PostgreSQL plus upload-volume disaster recovery when inspection evidence must move intact.

Property notes can contain sensitive operating information. Treat exported files as private backups and store them securely.

## Transfer Workflow

1. Log in as an `ADMIN` on the source instance.
2. Open `Admin` and use `Export Backup JSON` under `Backup / Transfer`.
3. Store or transmit the resulting JSON file securely.
4. Log in as an `ADMIN` on the destination instance.
5. Select the JSON file under `Backup / Transfer`.
6. Run `Dry Run Import` and review created, skipped, conflict, and error counts.
7. If the preview is acceptable, select `Confirm Merge Import`.
8. Create destination users and assign property access as needed.

## Import Safety

- Only format `makereadyos.backup` version `1` is accepted.
- Import mode is currently `merge` only.
- `dryRun: true` validates and previews without writing records.
- Existing destination records that match natural identity keys are skipped; they are not overwritten.
- Duplicate records inside an input backup are reported as conflicts/errors and block writes.
- Missing referenced properties, fields, or make-ready items are reported before writes.
- Confirmed imports run within a database transaction.

## Limitations

- There is no destructive replace or restore-in-place mode.
- Merge does not reconcile changes to already-existing records.
- A destination that already seeded a built-in column, schedule source, or property operating calendar keeps its existing configuration during merge; review and adjust presentation labels, tracks, and calendar rules after transfer when local choices differ. Older version-1 backups without newer optional schedule presentation keys remain accepted with safe defaults.
- Personal saved views and users are not transported.
- Native backup is not a full database disaster-recovery snapshot; maintain PostgreSQL-level backups using the procedure in [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).
## Section And Inbox Notes

Native JSON transfer includes property-owned board section metadata so renameable workflow labels move with the operational board. It intentionally excludes user notification inboxes and notification preferences, because those are personal delivery/read-state data rather than portable board configuration.

Comments transfer as author display snapshots rather than user-account relationships because users are intentionally excluded. Checklist instances transfer their task/completion records. Local uploads are authenticated runtime data stored outside the portable JSON format; include the `uploads_data` volume in host migration or disaster-recovery procedures.

Frog Pond uses committed runtime assets and browser-local display preferences in this foundation stage. Native JSON transfer does not include ignored raw reference assets, copied runtime assets, or local pond presets. If shared server-side pond presets are introduced later, they should be exported as safe configuration only.

Attachment intake permits bounded operational image, PDF, text/CSV, Word, and Excel files only. Local bytes remain excluded from native JSON transfer even though upload and download access is authenticated and property-scoped. Inspection-gallery ZIP exports are per-item convenience packages for the selected stage/category filter; they do not replace the upload-volume archive required for disaster recovery.

Property map records transfer as metadata plus building/area marker and unit marker coordinates only. Uploaded PNG/JPG/WebP/PDF map files stay in the local upload volume and should be included in PostgreSQL disaster-recovery/host backup procedures when visual maps are important.

## Integration Secrets

Native backup/transfer exports do not include API token hashes, webhook secret hashes, browser sessions, CSRF tokens, passwords, or private environment configuration. Recreate API tokens and webhook secrets on the destination instance after migration.

## Demo Reset Is Not Backup

`reset-demo.sh` is a local disposable-environment helper. It is not a transfer, restore, or migration tool. Use `backup-db.sh` and `backup-uploads.sh` before production updates; use native JSON export/import only when moving portable operational configuration/data between MakeReadyOS instances.
