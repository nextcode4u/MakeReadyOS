# Upload Storage

MakeReadyOS stores uploaded photos, documents, and property-map files as local files. PostgreSQL stores the metadata; the upload directory stores the actual bytes.

## Default Layout

Inside the API container, MakeReadyOS writes to:

```bash
UPLOAD_DIR=/app/uploads
```

Docker Compose mounts that path from:

```bash
UPLOADS_HOST_PATH=uploads_data
```

`uploads_data` is Docker's managed named volume. This is fine for testing and small deployments, but a photo-heavy property should use durable host storage.

## Recommended Production Pattern

Keep the container path stable:

```bash
UPLOAD_DIR=/app/uploads
```

Move the host storage to a dedicated path:

```bash
UPLOADS_HOST_PATH=/mnt/storage/makereadyos-uploads
```

That path can be a local SSD, external drive, or a NAS/Samba mount. The important rule is that the Docker host must see it as a normal writable directory before Compose starts.

## Admin Storage Screen

Admins can inspect upload storage from `Admin -> Uploads / NAS Storage`.

The screen shows:

- active runtime mode, either Docker volume or host/NAS path
- container upload path
- configured host source from `UPLOADS_HOST_PATH`
- per-file upload limit from `MAX_UPLOAD_MB`, or `No MakeReadyOS per-file limit` when set to `0`
- bundled web proxy body-size behavior
- current upload directory write status
- available filesystem space when the container can read it
- per-property upload routing for new files

The screen can validate a proposed host/NAS path and generate the required backup, dry-run, move, `.env`, and restart commands. It intentionally does not silently remount Docker storage from inside the browser. Docker still has to mount the final host/NAS path, and the Compose stack must be restarted before the new path is active.

## Per-Property Upload Routing

Admins can route new photos, attachments, and property-map uploads into property-specific subfolders from the Admin storage screen. This does not require a separate cloud integration. It works with the active upload volume whether that volume is Docker-managed, a NAS mount, Samba/NFS storage, or an OS-synced folder such as a mapped OneDrive path.

Example:

```text
/app/uploads/TA/<new files>
/app/uploads/VAB/<new files>
```

Existing files keep their current stored path so old attachments and maps continue to open. Routing affects new uploads only. If you need to physically reorganize older files, back up first and use a deliberate migration/move process rather than manually changing database paths.

## Route Existing Uploads Into Property Folders

After per-property routing is enabled, older root-level files can be moved into the configured property folders with a dry-run-first helper:

```bash
./route-existing-uploads.sh
./route-existing-uploads.sh --apply
```

Optional scoped run:

```bash
./route-existing-uploads.sh --property-id PROPERTY_ID
./route-existing-uploads.sh --apply --property-id PROPERTY_ID
```

The script:

- defaults to dry-run and prints every proposed file move
- applies pending Prisma migrations before reading upload metadata
- only processes properties configured for `PROPERTY_SUBDIR`
- only moves existing root-level upload files; already nested files are skipped for safety
- creates an upload backup before `--apply`
- moves the file bytes and updates database `storedName` values for attachments and property maps
- writes a timestamped log to `logs/`

Do not manually edit `storedName` values in PostgreSQL. The file path and database metadata must move together.

## Move Existing Uploads To A New Host Path

Use the helper from the project root:

```bash
./move-uploads.sh /mnt/storage/makereadyos-uploads --dry-run
./move-uploads.sh /mnt/storage/makereadyos-uploads
```

The script:

- refuses broad unsafe paths such as `/`, `/tmp`, `/mnt`, or the project root
- starts the API service if needed
- creates a timestamped upload backup first
- copies the current container upload contents into the target path
- writes a timestamped log to `logs/`
- prints the exact `.env` changes needed to activate the new path

After a successful copy:

```bash
UPLOADS_HOST_PATH=/mnt/storage/makereadyos-uploads
UPLOAD_DIR=/app/uploads
docker compose up -d
```

Verify existing attachments and property maps open before deleting any old storage.

## Backup Rules

Database backups are not enough for deployments with photos or maps.

Use both:

```bash
./backup-db.sh
./backup-uploads.sh
```

Restore both:

```bash
./restore-db.sh backups/makereadyos-db-YYYYMMDD-HHMMSS.dump
./restore-uploads.sh backups/makereadyos-uploads-YYYYMMDD-HHMMSS.tgz
```

Inspection-gallery ZIP exports are for per-unit evidence packets. They are not full storage backups.

## Upload Size And Reverse Proxy Limits

`MAX_UPLOAD_MB` controls the MakeReadyOS API file limit. Set it to `0` to disable the app-level per-file cap for high-resolution phone photos and HDR images. The bundled nginx web container is configured with `client_max_body_size 0`, so it does not impose its own request-body limit.

If you run Caddy, Nginx Proxy Manager, Traefik, Cloudflare Tunnel, or another proxy in front of MakeReadyOS, that proxy may still reject large uploads before MakeReadyOS can return a friendly error. Configure the external proxy body-size and timeout limits for the largest photo batch you expect to upload.

Operationally, `MAX_UPLOAD_MB=0` is not truly infinite. Browser memory, phone OS behavior, network stability, free disk space, and filesystem limits still apply. For 30-50 high-resolution photos, uploading in practical batches is still the safest field workflow.

## Current Limits

- Storage location is activated through `.env` and Docker Compose. The Admin storage screen validates and explains the move, but Docker still needs a restart to mount the final path.
- MakeReadyOS does not move files automatically after changing `.env`; run `move-uploads.sh` first. The workflow stays copy/verify first, activate second, and never silently abandon existing uploads.
- Per-property routing affects new files immediately after saving the setting. Existing root-level files remain valid until you intentionally run `route-existing-uploads.sh --apply`.
- There is no cloud object storage adapter yet.
- Very large phone galleries should still be uploaded in practical batches so the browser does not run out of memory before upload.
