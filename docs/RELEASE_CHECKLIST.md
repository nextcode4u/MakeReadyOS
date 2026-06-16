# Release Checklist

Use this before tagging or deploying a MakeReadyOS release.

## Environment

- Confirm Node.js 20+.
- Confirm Docker and Docker Compose are available.
- Copy `.env.example` to `.env`.
- Set strong `ADMIN_PASSWORD`.
- Set a unique `SESSION_COOKIE_SECRET` of at least 32 characters.
- Confirm `APP_URL` matches the deployment URL and that any temporary `EXTRA_ALLOWED_ORIGINS` entries are intentional.
- Confirm `TRUST_PROXY` matches the actual reverse-proxy topology.
- Confirm `UPLOAD_DIR`, `UPLOADS_HOST_PATH`, `MAX_UPLOAD_MB`, external reverse-proxy upload limits, and backup retention settings.

## Build And Test

Run:

```bash
./doctor.sh
./check-migration-hygiene.sh
./build.sh
./test.sh
./e2e.sh
./run-automations.sh
./run-analytics-snapshot.sh
npm --prefix apps/api audit --omit=dev
npm --prefix apps/web audit --omit=dev
```

Review generated logs in `logs/`.

On fresh Linux hosts or GitHub Actions E2E runners, use `PLAYWRIGHT_INSTALL_DEPS=1 ./e2e.sh` so Playwright installs OS browser dependencies. On machines where dependencies are already installed, plain `./e2e.sh` avoids unrelated apt repository failures.

## Docker Validation

```bash
docker compose config
docker compose up --build -d
curl http://localhost:4000/health
```

Open the UI and verify login with the configured admin account.
For a fresh instance, complete or intentionally skip the in-app setup guide.

## Backup Verification

- Run `./backup-db.sh`.
- Run `./check-migration-hygiene.sh` before assuming migration-only release upgrades are safe on the current stack. The helper now checks Prisma migration history status, live-db-vs-schema drift, and applied migration file checksums.
- Confirm a new dump exists in `backups/`.
- Run `./backup-uploads.sh` when attachments/photos/property maps exist.
- Run `./move-uploads.sh <host-path> --dry-run` before moving uploads from Docker's managed volume to host/NAS storage.
- Confirm a new upload archive exists in `backups/`.
- Confirm `./prune-backups.sh --dry-run` behaves as expected.
- Document where database and upload archives are copied off-host.
- For release candidates, rehearse restore in a disposable environment.

## Upload Volume

- Back up item attachments/photos.
- Back up property map files.
- Rehearse `./restore-uploads.sh` in a disposable environment before relying on it.
- Confirm file permissions survive restore.
- Document any external snapshot mechanism used by the host.

## Security

- Rotate demo/default credentials for real deployments.
- Confirm admin users are intentional.
- Revoke unused API tokens.
- Confirm no token hashes/password hashes are exported in native backup files.
- Confirm no runtime source imports `reference/`.
- Confirm API token rate-limit settings are intentional for the deployment.
- Set `WEBHOOK_SECRET_ENCRYPTION_KEY` before relying on webhook signing-secret persistence.
- For public deployments, decide whether webhook endpoints may target local/LAN services. Set `WEBHOOK_ALLOW_PRIVATE_URLS=false` to block private/local targets and use `WEBHOOK_ALLOWED_HOSTS` only for explicit trusted exceptions.
- If webhook integrations are used, run `./run-webhooks.sh` manually or schedule it and verify delivery-attempt history.
- Confirm `SECURITY.md` and `SUPPORT.md` match the repository's public contact/support expectations.

## Documentation

- Update `README.md`.
- Update changed docs under `docs/`.
- Update `reference/project/PROJECT_REFERENCE.md` with concise context only.
- Keep raw screenshots/exports out of git.
- Confirm issue templates are present under `.github/ISSUE_TEMPLATE/`.
- Confirm `.github/PULL_REQUEST_TEMPLATE.md` is current.
- Confirm screenshots referenced by the root README are committed under `docs/screenshots/`.
- Confirm `CHANGELOG.md` and `docs/RELEASE_PROCESS.md` describe the intended release/tag.

## Demo Data

- Confirm seed data is acceptable for screenshots/demos.
- Do not include private resident data.
- Use `./reset-demo.sh --dry-run` to preview reset actions.
- Use `./reset-demo.sh --yes` only for disposable environments; this restarts in blank first-run mode.
- Add `--with-demo` only when sample properties, units, and make-ready turns should be seeded.
- Add `--wipe-uploads` only when uploaded demo files should also be removed.

## Raspberry Pi / VM Notes

- Prefer Docker Compose deployment.
- Use a reverse proxy for HTTPS.
- Use scheduled PostgreSQL backups.
- Schedule analytics snapshots if trend dashboards matter.
- Review Planning after seed/restore to confirm staff capacity and active work blocks are intentional.
- Back up upload volumes separately.
- Keep enough disk space for `postgres_data`, `uploads_data`, `backups/`, and Docker images.
