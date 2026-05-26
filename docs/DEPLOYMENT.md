# Deployment

MakeReadyOS is designed for Docker Compose on a Raspberry Pi, mini PC, VM, or VPS.

## Basic Deployment

1. Install Docker and Docker Compose.
2. Copy `.env.example` to `.env`.
3. Set strong values for `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, and `SESSION_COOKIE_SECRET`.
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
- `CORS_ORIGIN`
- `UPLOAD_DIR`
- `MAX_UPLOAD_MB`

Leave demo user variables set only for evaluation environments. Remove or rotate demo credentials before real use.

## Updates

Before updating:

1. Run `./backup-db.sh`.
2. Run `./backup-uploads.sh` if attachments or map uploads are used.
3. Pull or copy the updated source.
4. Run `./doctor.sh`.
5. Run `npm --prefix apps/api run db:deploy` for production migration deployment.
6. Run `docker compose up --build -d`.

The API container also runs `db:deploy` on start and falls back to `db:push` for early disposable environments. For production-like deployments, run `db:deploy` intentionally after a backup so schema changes are explicit.

## Raspberry Pi Notes

- Use a reliable SSD or high-endurance storage for PostgreSQL and uploads.
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
