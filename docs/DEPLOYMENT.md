# Deployment

MakeReadyOS is designed for Docker Compose on a Raspberry Pi, mini PC, VM, or VPS.

## Basic Deployment

1. Install Docker and Docker Compose.
2. Copy `.env.example` to `.env`.
3. Set strong values for `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `SESSION_COOKIE_SECRET`, and `WEBHOOK_SECRET_ENCRYPTION_KEY`.
4. Run `./doctor.sh`.
5. Run `docker compose up --build -d`.
6. Sign in with the configured admin account and complete the setup guide.

Minimum production-sensitive environment values:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SESSION_COOKIE_SECRET`
- `WEBHOOK_SECRET_ENCRYPTION_KEY`
- `WEBHOOK_DELIVERY_BATCH_SIZE`
- `WEBHOOK_DELIVERY_TIMEOUT_MS`
- `WEBHOOK_DELIVERY_MAX_ATTEMPTS`
- `WEBHOOK_AUTO_DISABLE_FAILURES`
- `WEBHOOK_ALLOW_PRIVATE_URLS`
- `WEBHOOK_ALLOWED_HOSTS`
- `CORS_ORIGIN`
- `UPLOAD_DIR`
- `UPLOADS_HOST_PATH`
- `MAX_UPLOAD_MB`

For public deployments that allow admins to register webhook endpoints, set `WEBHOOK_ALLOW_PRIVATE_URLS=false` unless you intentionally deliver webhooks to local/LAN services. Use `WEBHOOK_ALLOWED_HOSTS` for explicit trusted exceptions.

Leave demo user variables set only for evaluation environments. Remove or rotate demo credentials before real use.

`MAX_UPLOAD_MB` defaults to `0`, which disables MakeReadyOS' app-level per-file upload cap. The bundled nginx web container also does not impose a request-body limit. If you put MakeReadyOS behind another reverse proxy, set that proxy's body-size and timeout limits for large phone-photo batches or uploads may fail before the API can return a clear error.

Keep `UPLOAD_DIR=/app/uploads` for Docker deployments. Set `UPLOADS_HOST_PATH` when file bytes should live somewhere other than Docker's managed `uploads_data` volume:

```bash
UPLOADS_HOST_PATH=/mnt/storage/makereadyos-uploads
```

For existing deployments, run `./move-uploads.sh /mnt/storage/makereadyos-uploads` before changing `.env`. See [UPLOAD_STORAGE.md](UPLOAD_STORAGE.md).

Admins can also open `Admin -> Uploads / NAS Storage` to inspect the active upload mode, confirm current write status, validate a proposed host/NAS path, and copy the generated move/restart commands. The UI is a safety assistant; Docker still needs the host path mounted through `UPLOADS_HOST_PATH`.

## Updates

Before updating:

1. Run `./backup-db.sh`.
2. Run `./backup-uploads.sh` if attachments or map uploads are used.
3. Pull or copy the updated source.
4. Run `./doctor.sh`.
5. Run `npm --prefix apps/api run db:deploy` for production migration deployment.
6. Run `docker compose up --build -d`.

The API container also runs `db:deploy` on start and falls back to `db:push` for early disposable environments. For production-like deployments, run `db:deploy` intentionally after a backup so schema changes are explicit.

For release-tagged upgrades, also review [RELEASE_PROCESS.md](RELEASE_PROCESS.md). GitHub Releases should include any migration notes, backup reminders, known limitations, and rollback guidance for that version.

## Raspberry Pi Notes

- Use a reliable SSD or high-endurance storage for PostgreSQL and uploads.
- For photo-heavy deployments, mount uploads to a dedicated host path or NAS share with `UPLOADS_HOST_PATH`.
- Schedule `backup-db.sh` and `backup-uploads.sh`.
- Monitor free disk space. Uploads and Docker images can grow over time.
- Use a reverse proxy such as Caddy or Nginx Proxy Manager for HTTPS when exposing the app.

## Demo Reset

`./reset-demo.sh --dry-run` shows what will be reset.

`./reset-demo.sh --yes` removes the Docker database volume and restarts the stack. Uploads are preserved by default.

`./reset-demo.sh --yes --wipe-uploads` also removes the uploads volume.

Use this only for local demo environments. Back up production data before any destructive maintenance.

## Backup Boundaries

- PostgreSQL backups contain operational database records.
- Upload backups contain local attachments, photos, and map files.
- Native JSON transfer exports are for MakeReadyOS-to-MakeReadyOS operational transfer, not full disaster recovery.

Database backup alone is not enough if the deployment uses attachments, photos, or property-map uploads. Pair `./backup-db.sh` with `./backup-uploads.sh` before upgrades and on the normal backup schedule.
