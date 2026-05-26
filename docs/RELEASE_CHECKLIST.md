# Release Checklist

Use this before tagging or deploying a MakeReadyOS release.

## Environment

- Confirm Node.js 20+.
- Confirm Docker and Docker Compose are available.
- Copy `.env.example` to `.env`.
- Set strong `ADMIN_PASSWORD`.
- Set a unique `SESSION_COOKIE_SECRET` of at least 32 characters.
- Confirm `CORS_ORIGIN` matches the deployment URL.
- Confirm `UPLOAD_DIR`, `MAX_UPLOAD_MB`, and backup retention settings.

## Build And Test

Run:

```bash
./doctor.sh
./build.sh
./test.sh
./e2e.sh
./run-automations.sh
./run-analytics-snapshot.sh
npm --prefix apps/api audit --omit=dev
npm --prefix apps/web audit --omit=dev
```

Review generated logs in `logs/`.

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
- Confirm a new dump exists in `backups/`.
- Run `./backup-uploads.sh` when attachments/photos/property maps exist.
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
- Keep webhook delivery disabled/scaffolded until signed delivery exists.
- Confirm `SECURITY.md` and `SUPPORT.md` match the repository's public contact/support expectations.

## Documentation

- Update `README.md`.
- Update changed docs under `docs/`.
- Update `reference/project/PROJECT_REFERENCE.md` with concise context only.
- Keep raw screenshots/exports out of git.
- Confirm issue templates are present under `.github/ISSUE_TEMPLATE/`.
- Confirm screenshots referenced by the root README are committed under `docs/screenshots/`.

## Demo Data

- Confirm seed data is acceptable for screenshots/demos.
- Do not include private resident data.
- Use `./reset-demo.sh --dry-run` to preview demo reset actions.
- Use `./reset-demo.sh --yes` only for disposable demos; add `--wipe-uploads` only when uploaded demo files should also be removed.

## Raspberry Pi / VM Notes

- Prefer Docker Compose deployment.
- Use a reverse proxy for HTTPS.
- Use scheduled PostgreSQL backups.
- Schedule analytics snapshots if trend dashboards matter.
- Review Planning after seed/restore to confirm staff capacity and active work blocks are intentional.
- Back up upload volumes separately.
- Keep enough disk space for `postgres_data`, `uploads_data`, `backups/`, and Docker images.
