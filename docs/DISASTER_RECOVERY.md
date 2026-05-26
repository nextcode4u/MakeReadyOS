# Disaster Recovery

## Two Different Backup Tools

MakeReadyOS provides two backup paths with different purposes:

| Tool | Purpose | Includes | Excludes |
| --- | --- | --- | --- |
| Native JSON transfer in the Admin UI | Move operational board data between MakeReadyOS instances | Selected operational records and configuration intended for safe merge import | Users, passwords, sessions, audit history, environment secrets, destructive replacement |
| `./backup-db.sh` PostgreSQL dump | Restore a failed or lost deployment as a whole | The complete PostgreSQL database, including users, sessions, audit history, attachment metadata, configuration records, and operational data stored in PostgreSQL | `.env` secrets, reverse proxy configuration, and uploaded file bytes stored in the separate `uploads_data` volume |
| `./backup-uploads.sh` upload archive | Preserve local attachment/photo/property-map bytes | The Docker API container upload directory (`/app/uploads`) as a timestamped `.tgz` archive | PostgreSQL records, users, sessions, secrets, reverse proxy configuration |

Native JSON is a controlled migration/export feature. A PostgreSQL dump is the disaster-recovery backup for replacing a lost database.

## Create A Database Backup

The database helper works with the Docker Compose deployment and uses `pg_dump` inside the PostgreSQL container. It creates a PostgreSQL custom-format dump and a separate execution log:

```bash
./backup-db.sh
```

Generated files:

```text
backups/makereadyos-db-YYYYMMDD-HHMMSS.dump
logs/backup-db-YYYYMMDD-HHMMSS.txt
```

The script sources `.env`, falling back to `.env.example`, and reads `POSTGRES_DB` and `POSTGRES_USER`. It starts the `db` service if needed and does not stop the running application. When `BACKUP_RETENTION_DAYS` is set, a successful dump is followed by repo-local expiration pruning through `./prune-backups.sh`.

Store dump files outside the host after creation. A backup left only on the Raspberry Pi or VM does not protect against disk or hardware loss.

## Create An Upload Backup

Attachments and property map files live outside PostgreSQL in the Docker upload volume. Back up those bytes separately:

```bash
./backup-uploads.sh
```

Generated files:

```text
backups/makereadyos-uploads-YYYYMMDD-HHMMSS.tgz
logs/backup-uploads-YYYYMMDD-HHMMSS.txt
```

The helper refuses unexpected upload paths by default and expects the Compose API service path `/app/uploads`. If you customize upload storage, verify the helper and host volume mapping before relying on it.

## Restore An Upload Backup

Upload restore replaces the current upload directory content:

```bash
./restore-uploads.sh backups/makereadyos-uploads-20260524-120000.tgz
```

The script validates the archive, warns about destructive replacement, requires the operator to type `RESTORE_UPLOADS`, clears `/app/uploads` in the API container, and extracts the archive. Restore the database first, then restore uploads, so attachment metadata and files line up.

## Restore A Database Backup

Restore is destructive. It replaces the PostgreSQL database with the content in the supplied dump.

```bash
./restore-db.sh backups/makereadyos-db-20260524-120000.dump
```

The script:

1. Validates the file as a PostgreSQL custom-format or plain SQL dump.
2. Displays a destructive-operation warning.
3. Refuses to proceed unless the operator types `RESTORE`.
4. Stops the `api` and `web` services.
5. Drops and recreates the configured application database.
6. Uses `pg_restore` for custom dumps or `psql` for plain SQL dumps.
7. Restarts the `api` and `web` services after a successful restore.
8. Writes a timestamped log in `logs/`.

If restore fails after the application services stop, inspect the restore log and resolve the database issue before restarting the services.

## Raspberry Pi Or VM Recovery Procedure

For a deployed Raspberry Pi, mini PC, VM, or VPS:

1. Keep a secure copy of the deployment `.env` file or securely recorded replacement credentials separately from database dumps.
2. Schedule `./backup-db.sh` on the host.
3. Schedule `./backup-uploads.sh` whenever attachments or property maps matter.
4. Copy generated `.dump` and `.tgz` files to a different physical device or encrypted remote storage.
5. After hardware loss, provision a replacement host with Docker Compose and the correct `.env`.
6. Place the selected backup files on the replacement host.
7. Start from the MakeReadyOS project directory and run `./restore-db.sh <backup-file>`, then `./restore-uploads.sh <upload-archive>`.
8. Log in and verify recent board data, users, key audit history, attachment downloads, and property maps.

The PostgreSQL dump restores database-backed authentication records. Existing browser cookies should not be considered reliable after recovery; users may need to sign in again.

## Recommended Schedule

- Small active deployment: run a database backup nightly.
- High-change or move-in-heavy periods: run backups at least every 6 to 12 hours.
- Before upgrades, migrations, or large imports: create a manual backup immediately before the change.
- Before attachment-heavy maintenance or map work: confirm an upload archive exists.
- Retention baseline: keep at least 7 daily backups and 4 weekly backups off-device.
- Regularly test a restore on a separate non-production instance. An untested backup is not a verified recovery path.

Linux scheduling and local retention examples are provided in [SCHEDULED_BACKUPS.md](SCHEDULED_BACKUPS.md). Local pruning protects disk capacity; it does not provide off-device disaster recovery.

Attachments uploaded through the item drawer are stored in the Docker `uploads_data` volume. A complete deployment backup must preserve both the PostgreSQL dump and that volume's files; restoring the database alone restores attachment metadata but not the actual downloadable photos/documents.

`./seed-large.sh` is intended only for non-production load validation. Its generated rows, light comments, checklist instances, and custom values are regular database records and appear in dumps unless removed before backup.

## Security Notes

- Database dumps contain sensitive operational data and authentication records, including password hashes and audit history.
- Do not commit files under `backups/`; the directory is gitignored except for its placeholder.
- Encrypt off-host backup storage and limit access to administrators.
- Keep `.env`, HTTPS certificates, reverse-proxy settings, and any future external attachment storage in a separate secure recovery plan.
