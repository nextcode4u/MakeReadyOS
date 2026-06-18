# Deployment

MakeReadyOS is designed for Docker Compose on a Raspberry Pi, mini PC, VM, or VPS.

## Basic Deployment

1. Install Docker and Docker Compose.
2. Copy `.env.example` to `.env`.
3. Set strong values for `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, `SESSION_COOKIE_SECRET`, and `WEBHOOK_SECRET_ENCRYPTION_KEY`. `ADMIN_EMAIL` remains optional unless you want email-based sign-in or invite emails.
4. Run `./doctor.sh`.
5. Run `docker compose up --build -d`.
6. Sign in with the configured admin account and complete the setup guide.

Minimum production-sensitive environment values:

- `ADMIN_USERNAME` or `ADMIN_EMAIL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `SESSION_COOKIE_SECRET`
- `WEBHOOK_SECRET_ENCRYPTION_KEY`
- `WEBHOOK_DELIVERY_BATCH_SIZE`
- `WEBHOOK_DELIVERY_TIMEOUT_MS`
- `WEBHOOK_DELIVERY_MAX_ATTEMPTS`
- `WEBHOOK_AUTO_DISABLE_FAILURES`
- `WEBHOOK_ALLOW_PRIVATE_URLS`
- `WEBHOOK_ALLOWED_HOSTS`
- `APP_URL`
- `EXTRA_ALLOWED_ORIGINS`
- `SELF_HOSTED`
- `TRUST_PROXY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_REPLY_TO`
- `UPLOAD_DIR`
- `UPLOADS_HOST_PATH`
- `MAX_UPLOAD_MB`
- `APP_RELEASE_CHANNEL`
- `APP_BUILD_REF`
- `APP_BUILD_DATE`
- `APP_UPDATE_RELEASES_ENABLED`
- `APP_UPDATE_REPO`

Set `APP_URL` to the actual URL operators use to reach MakeReadyOS. This is now the primary source of truth for browser origin validation, trusted-origin checks, cookie security, and self-hosted diagnostics:

```bash
APP_URL=http://localhost:8080
```

Examples:

```bash
APP_URL=http://your-lan-host-or-ip:8080
APP_URL=https://makereadyos.duckdns.org
APP_URL=https://makereadyos.example.com
```

Use `EXTRA_ALLOWED_ORIGINS` only when you intentionally want more than one browser origin during migration, testing, or mixed local/domain access:

```bash
EXTRA_ALLOWED_ORIGINS=http://localhost:5173,http://your-lan-host-or-ip:8080
```

Set `TRUST_PROXY=true` when MakeReadyOS is running behind Caddy, Nginx, Traefik, Cloudflare Tunnel, or another reverse proxy that terminates HTTPS and forwards `X-Forwarded-*` headers. Leave it `false` for direct local Docker access.

`SELF_HOSTED=true` is the default deployment model and keeps origin handling centered on `APP_URL` plus `EXTRA_ALLOWED_ORIGINS`. `CORS_ORIGIN` remains as a deprecated fallback only for older installs.

## Optional User Invite Emails

If admins should email new users their login details from `Admin -> User Management`, configure SMTP in `.env`:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASS=replace-with-mail-password
SMTP_FROM=MakeReadyOS <mailer@example.com>
SMTP_REPLY_TO=operations@example.com
```

Notes:

- Invite delivery is optional and only runs when the admin checks `Send invite email` during user creation.
- If SMTP is not configured, user creation still works; the invite checkbox should be left off.
- If the user account is created but SMTP delivery fails, MakeReadyOS keeps the user and reports that invite delivery failed so credentials can be shared another way.

## Common Self-Hosted Origin Setups

### Direct LAN Access

If users open the app directly by LAN IP and port:

```bash
APP_URL=http://your-lan-host-or-ip:8080
SELF_HOSTED=true
TRUST_PROXY=false
EXTRA_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:5173
```

### DuckDNS / Reverse Proxy / HTTPS

If users open the app through a public hostname and your outer proxy terminates HTTPS:

```bash
APP_URL=https://your-public-hostname.example.com
SELF_HOSTED=true
TRUST_PROXY=true
EXTRA_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:5173
```

With `TRUST_PROXY=true`, the API trusts the forwarded scheme/host from the outer proxy and preserves HTTPS origin validation/cookie behavior correctly.

### Mixed Local And Public Access

If operators sometimes use a public hostname and sometimes use a LAN URL:

```bash
APP_URL=https://your-public-hostname.example.com
SELF_HOSTED=true
TRUST_PROXY=true
EXTRA_ALLOWED_ORIGINS=http://your-lan-host-or-ip:8080,http://localhost:8080,http://localhost:5173
```

For public deployments that allow admins to register webhook endpoints, set `WEBHOOK_ALLOW_PRIVATE_URLS=false` unless you intentionally deliver webhooks to local/LAN services. Use `WEBHOOK_ALLOWED_HOSTS` for explicit trusted exceptions.

Leave demo user variables set only for evaluation environments. Remove or rotate demo credentials before real use.

`SEED_DEMO_DATA=false` is the recommended first-run setting. It creates the admin user plus baseline MakeReadyOS configuration such as built-in labels, column display names, schedule tracks, and checklist templates, but does not create sample properties, units, or turn records. Set `SEED_DEMO_DATA=true` only for disposable evaluation environments that need sample records.

`MAX_UPLOAD_MB` defaults to `0`, which disables MakeReadyOS' app-level per-file upload cap. The bundled nginx web container also does not impose a request-body limit. If you put MakeReadyOS behind another reverse proxy, set that proxy's body-size and timeout limits for large phone-photo batches or uploads may fail before the API can return a clear error.

Keep `UPLOAD_DIR=/app/uploads` for Docker deployments. Set `UPLOADS_HOST_PATH` when file bytes should live somewhere other than Docker's managed `uploads_data` volume:

```bash
UPLOADS_HOST_PATH=/mnt/storage/makereadyos-uploads
```

For existing deployments, run `./move-uploads.sh /mnt/storage/makereadyos-uploads` before changing `.env`. See [UPLOAD_STORAGE.md](UPLOAD_STORAGE.md).

Admins can also open `Admin -> Uploads / NAS Storage` to inspect the active upload mode, confirm current write status, validate a proposed host/NAS path, and copy the generated move/restart commands. The UI is a safety assistant; Docker still needs the host path mounted through `UPLOADS_HOST_PATH`.

Admins can also open `Admin -> Deployment updates` to confirm the installed version, release channel, optional build ref/date metadata, optional latest GitHub release visibility, and copy the preferred `./update.sh` commands without opening the shell docs first. The actual update still runs on the host server.

For normal self-hosted use, MakeReadyOS now accepts the request's own effective origin when `SELF_HOSTED=true`, so LAN-IP and hostname access through the same browser origin no longer requires every alias to be prelisted in `EXTRA_ALLOWED_ORIGINS`. Keep `APP_URL` pointed at the primary URL you expect operators to use, and use `EXTRA_ALLOWED_ORIGINS` only for deliberate additional origins such as a migration hostname, alternate reverse-proxy domain, or local development port.

If you want the in-app update panel to show the latest published GitHub release, leave `APP_UPDATE_RELEASES_ENABLED=true` and point `APP_UPDATE_REPO` at the public repository:

```bash
APP_UPDATE_RELEASES_ENABLED=true
APP_UPDATE_REPO=nextcode4u/MakeReadyOS
```

Set `APP_UPDATE_RELEASES_ENABLED=false` for fully local/offline installs that should never call GitHub from the API container.

## Updates

Before updating:

Preferred update path:

```bash
./update.sh --yes
```

This helper:

1. runs `./backup-db.sh`
2. runs `./backup-uploads.sh`
3. runs `./doctor.sh`
4. runs `./check-migration-hygiene.sh`
5. runs Prisma `db:deploy` on the host when `node`/`npm` are installed, or inside the running `api` container for Docker-only installs
6. runs `docker compose up --build -d`

If you also want the script to pull the latest git changes first:

```bash
./update.sh --pull --yes
```

If you need to move to a specific branch/tag/commit:

```bash
./update.sh --ref v0.1.0-rc1 --yes
```

Manual equivalent:

1. Run `./backup-db.sh`.
2. Run `./backup-uploads.sh` if attachments or map uploads are used.
3. Pull or copy the updated source.
4. Run `./doctor.sh`.
5. Run `./check-migration-hygiene.sh`.
6. Run `npm --prefix apps/api run db:deploy` for production migration deployment, or `docker compose exec -T api npm run db:deploy` on Docker-only hosts without local Node.js.
7. Run `docker compose up --build -d`.

The API container also runs `db:deploy` on start and falls back to `db:push` for early disposable environments. For production-like deployments, run `db:deploy` intentionally after a backup so schema changes are explicit.

For release-tagged upgrades, also review [RELEASE_PROCESS.md](RELEASE_PROCESS.md). GitHub Releases should include any migration notes, backup reminders, known limitations, and rollback guidance for that version.

## Raspberry Pi Notes

- Use a reliable SSD or high-endurance storage for PostgreSQL and uploads.
- For photo-heavy deployments, mount uploads to a dedicated host path or NAS share with `UPLOADS_HOST_PATH`.
- Schedule `backup-db.sh` and `backup-uploads.sh`.
- Monitor free disk space. Uploads and Docker images can grow over time.
- Use a reverse proxy such as Caddy or Nginx Proxy Manager for HTTPS when exposing the app.

## Mobile Browser Install

MakeReadyOS ships a Progressive Web App manifest and service worker so mobile browsers can install it to the home screen without a native app package. Android/Chrome can show an optional in-app install prompt when the browser supports `beforeinstallprompt`; users can dismiss it and keep using the browser. iOS Safari does not expose that event, so users install through Share -> Add to Home Screen.

For real mobile deployments, use HTTPS through a reverse proxy. Many browsers require a secure origin before they will offer installation or service-worker behavior outside `localhost`.

The service worker caches the app shell plus previously fetched same-origin JSON `GET /api/...` responses with a network-first fallback. Upload/download/report routes remain network-bound, while supported mobile-field writes use the browser-local IndexedDB sync queue and are deleted only after the server confirms success.

## Demo Reset

`./reset-demo.sh --dry-run` shows what will be reset.

`./reset-demo.sh --yes` removes the Docker database volume and restarts the stack in blank first-run mode. Uploads are preserved by default.

`./reset-demo.sh --yes --with-demo` resets and then seeds sample properties, units, and make-ready turns for evaluation.

`./reset-demo.sh --yes --wipe-uploads` also removes the uploads volume.

Use this only for local demo environments. Back up production data before any destructive maintenance.

## Backup Boundaries

- PostgreSQL backups contain operational database records.
- Upload backups contain local attachments, photos, and map files.
- Native JSON transfer exports are for MakeReadyOS-to-MakeReadyOS operational transfer, not full disaster recovery.

Database backup alone is not enough if the deployment uses attachments, photos, or property-map uploads. Pair `./backup-db.sh` with `./backup-uploads.sh` before upgrades and on the normal backup schedule.
