# Release Process

Use this process when preparing a MakeReadyOS source release or GitHub Release.

## Release Channel

MakeReadyOS is pre-1.0 software. Use release-candidate tags until deployments have enough real-world soak time.

Recommended tag format:

```text
v0.1.0-rc1
v0.1.0-rc2
v0.1.0
```

## Before Tagging

1. Review [FEATURE_STATUS.md](FEATURE_STATUS.md), [TECH_DEBT.md](TECH_DEBT.md), and [UX_DEBT.md](UX_DEBT.md).
2. Confirm `README.md` screenshots and setup steps are current.
3. Confirm no local-only data is staged:
   - `.env`
   - `logs/`
   - `backups/`
   - `uploads/`
   - `reference/`
   - `node_modules/`
   - `playwright-report/`
   - `test-results/`
4. Run the release validation commands from [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
5. Review generated logs under `logs/`.
6. Confirm GitHub Actions CI passes.
7. Run the manual E2E workflow from GitHub Actions, or run `./e2e.sh` locally.

## Required Validation

```bash
./doctor.sh
./build.sh
./test.sh
./e2e.sh
./run-automations.sh
./run-analytics-snapshot.sh
./backup-db.sh
./backup-uploads.sh
npm --prefix apps/api audit --omit=dev
npm --prefix apps/web audit --omit=dev
```

On a fresh Linux machine that lacks browser dependencies, use:

```bash
PLAYWRIGHT_INSTALL_DEPS=1 ./e2e.sh
```

## Tagging

Use an annotated tag after validation:

```bash
git tag -a v0.1.0-rc1 -m "MakeReadyOS v0.1.0-rc1"
git push origin main
git push origin v0.1.0-rc1
```

## GitHub Release Notes

Include:

- Main feature highlights.
- Upgrade steps.
- Migration notes.
- Backup-before-upgrade reminder.
- Upload-volume backup reminder.
- Known limitations.
- Link to [DEPLOYMENT.md](DEPLOYMENT.md), [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md), and [BACKUP_AND_TRANSFER.md](BACKUP_AND_TRANSFER.md).

## Upgrade Guidance For Users

For Docker Compose deployments:

1. Back up PostgreSQL with `./backup-db.sh`.
2. Back up uploads with `./backup-uploads.sh`.
3. Pull the new source or release archive.
4. Run `./doctor.sh`.
5. Run `npm --prefix apps/api run db:deploy`.
6. Rebuild and start:

```bash
docker compose up --build -d
```

Rollback requires restoring both database and upload backups from the same point in time.

## Repository Metadata

Recommended GitHub topics:

- `property-management`
- `maintenance`
- `operations`
- `self-hosted`
- `dashboard`
- `automation`
- `react`
- `docker`
- `postgres`
