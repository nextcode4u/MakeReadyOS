# Scheduled Backups

## Purpose

MakeReadyOS does not run a backup scheduler inside the application. Linux hosts should schedule `./backup-db.sh` so database backup behavior remains simple, visible, and independent of the web app.

The supplied examples target a Docker Compose deployment installed at `/opt/makereadyos`. Adjust that path and service user for your server.

## Retention Configuration

Set local dump retention in the deployment `.env` file:

```bash
BACKUP_RETENTION_DAYS=14
```

When this value is set, every successful `./backup-db.sh` run calls `./prune-backups.sh --days "$BACKUP_RETENTION_DAYS"`. The pruning helper:

- deletes only matching `backups/makereadyos-db-*.dump` files older than the configured number of days
- refuses any backup directory outside the repository-local `backups/` directory
- writes its own timestamped log under `logs/`
- supports previewing candidates without deleting them

```bash
./prune-backups.sh --dry-run
./prune-backups.sh --days 30
```

Local retention controls disk growth only. Copy backups to encrypted off-host storage before they age out locally.

## Systemd Timer Setup

Example files are included:

- `deploy/examples/makereadyos-backup.service`
- `deploy/examples/makereadyos-backup.timer`

The timer runs nightly at approximately `02:15`, with up to 15 minutes of randomized delay. To install on a Raspberry Pi, VM, or Linux server using systemd:

```bash
sudo cp deploy/examples/makereadyos-backup.service /etc/systemd/system/
sudo cp deploy/examples/makereadyos-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now makereadyos-backup.timer
sudo systemctl list-timers makereadyos-backup.timer
```

Before enabling the timer:

- install the project at `/opt/makereadyos`, or update `WorkingDirectory` and `ExecStart` in the service file
- create a local `makereadyos` Linux user, or change `User` to the deployment operator
- grant that user permission to access Docker, commonly through the `docker` group
- put database settings and `BACKUP_RETENTION_DAYS` in `/opt/makereadyos/.env`

The example unit contains no passwords or tokens. The script reads configuration from the deployment `.env` file.

View timer execution and application backup logs with:

```bash
systemctl status makereadyos-backup.timer
journalctl -u makereadyos-backup.service
ls -lh /opt/makereadyos/backups/
ls -1t /opt/makereadyos/logs/backup-db-*.txt | head
```

## Cron Alternative

If the host does not use systemd, schedule the same script with cron. This example contains no secrets:

```cron
15 2 * * * cd /opt/makereadyos && ./backup-db.sh
```

Use the account that owns the deployment and can run `docker compose`. Keep credentials in `.env`, not in the crontab.

## Operational Verification

After scheduling:

1. Run `./backup-db.sh` manually once.
2. Confirm a new `.dump` file appears under `backups/`.
3. Confirm a backup log and, when retention is configured, a prune log appear under `logs/`.
4. Run `./prune-backups.sh --dry-run` to inspect local expiration behavior.
5. Regularly copy dumps off-host.
6. Periodically restore a dump on a separate non-production instance.

## Not Included

- No cloud upload integration is included.
- No built-in web application scheduler is included.
- No rotation of off-host backup copies is included.
