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

## Dependency Monitoring

CI audits production dependencies on pushes and pull requests. The Dependency Security Audit workflow checks all dependencies, including build and test tools, in the three lockfiles daily and can be run manually. Dependabot checks npm dependencies and GitHub Actions weekly; upgrades still require review and tests, not automatic merging. Enable GitHub Actions failure notifications and repository Dependabot alerts in your account/repository settings to receive alerts.

Track reviewed findings in [docs/SECURITY_TRACKING.md](docs/SECURITY_TRACKING.md). Use vendor advisories and the GitHub Advisory Database to establish affected versions, then check NVD, CISA KEV and Exploit-DB for additional context. Exploit-DB checks are manual, not part of the scheduled npm audit. No listing does not establish that a vulnerability is unexploitable.

These checks do not cover every container, operating-system or infrastructure vulnerability. Keep deployment inventories and exposure details private; never put production addresses, credentials or resident data in security notes or public issues.

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
