# Security Policy

## Supported Versions

MakeReadyOS is pre-1.0 software. Security fixes are handled on the active main development line until a formal release/support policy is published.

## Reporting A Vulnerability

Do not open a public issue for a suspected vulnerability.

Report privately by contacting the project maintainer or repository owner through the preferred private channel listed on the GitHub repository. Include:

- affected version or commit
- deployment type
- steps to reproduce
- expected impact
- logs or screenshots if safe to share

Avoid sending real resident, staff, vendor, property, attachment, token, password, or backup data.

## Security Scope

Security-sensitive areas include:

- authentication and sessions
- roles and property-scoped permissions
- API tokens and integration scopes
- uploads and authenticated file access
- native backup/import/export
- PostgreSQL and upload-volume backups
- automations and operational-library imports

MakeReadyOS intentionally does not execute arbitrary imported JavaScript or untrusted plugin code.

## Deployment Responsibility

Self-hosted operators are responsible for:

- changing all demo credentials before real use
- setting a strong `SESSION_COOKIE_SECRET`
- keeping `.env` private
- using HTTPS when exposed beyond localhost
- backing up PostgreSQL and uploads
- restricting access to database dumps and upload archives
- updating containers/dependencies when fixes are released

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md), and [docs/BACKUP_AND_TRANSFER.md](docs/BACKUP_AND_TRANSFER.md).
