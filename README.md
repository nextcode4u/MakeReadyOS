# MakeReadyOS

MakeReadyOS is a self-hosted property operations platform focused on apartment make-ready and maintenance workflows. It is inspired by dense monday.com-style boards, but built for local ownership, Docker deployment, and property maintenance operations.

The core workflow is a fast table-first make-ready board with Kanban, Schedule, Dashboard, item drawer, comments, attachments, checklists, vendors, risk scoring, automations, property maps, and a Frog Pond visualization.

## What MakeReadyOS Is / Is Not

MakeReadyOS is:

- A self-hosted operations board for property maintenance and apartment turns.
- A table-first daily workflow for supervisors, techs, leasing, cleaners, and managers.
- A local-first system for make-ready tracking, comments/photos, checklists, vendors, scheduling, automations, risk visibility, and operational reporting.
- An open-source foundation for integrations through documented JSON/API contracts.

MakeReadyOS is not:

- A property-management accounting system.
- A resident ledger, rent collection, or leasing CRM replacement.
- A vendor compliance platform like NetVendor.
- A public SaaS service or hosted marketplace.
- A plugin runtime for arbitrary untrusted JavaScript.

## Screenshots

| Table | Dashboard |
| --- | --- |
| ![MakeReadyOS table view](docs/screenshots/table-view.png) | ![MakeReadyOS dashboard](docs/screenshots/dashboard.png) |

| Kanban | Schedule |
| --- | --- |
| ![MakeReadyOS Kanban view](docs/screenshots/kanban.png) | ![MakeReadyOS schedule view](docs/screenshots/schedule.png) |

| Frog Pond |
| --- |
| ![MakeReadyOS Frog Pond](docs/screenshots/frog-pond.png) |

## What It Includes

- Dense make-ready table with inline editing, custom fields, managed labels, floor plans, batch actions, and archive/restore workflows.
- Kanban, Schedule, Dashboard, Activity, My Work, Planning, Vendors, Maps, Frog Pond, Automations, Setup, Fields, Admin, and Integrations workspaces.
- Authentication, roles, property-scoped permissions, audit logs, API tokens, and in-app notifications.
- Local attachments/photos, item comments, checklist templates, item drawer, unit history, analytics snapshots, and risk scoring.
- Docker Compose, PostgreSQL, Prisma, Fastify, React, Vite, TypeScript, backup scripts, and deployment docs.

For a fuller feature walkthrough, see [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md) and [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md).

## Stack

- `apps/api`: Node 20, Fastify 5, Prisma, PostgreSQL
- `apps/web`: React, Vite, TypeScript
- `docker-compose.yml`: web, API, and PostgreSQL services
- Root scripts for build, test, E2E, backups, automation runs, analytics snapshots, and diagnostics

## Quick Start With Docker

Requirements:

- Docker and Docker Compose
- Node.js 20+ if running scripts outside containers

```bash
git clone <your-fork-or-repo-url> makereadyos
cd makereadyos
cp .env.example .env
docker compose up --build -d
```

Open:

- Web UI: `http://localhost:8080`
- API health: `http://localhost:4000/health`

Default demo credentials come from `.env`. With the provided example values:

```text
admin@example.com
ChangeThisAdmin!23456
```

Change `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_COOKIE_SECRET` before using a real deployment.

For deployment details, including Raspberry Pi/VM notes, updates, migrations, backups, upload volume handling, and restore, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md), and [docs/BACKUP_AND_TRANSFER.md](docs/BACKUP_AND_TRANSFER.md).

## Local Development

```bash
npm install
npm --prefix apps/api install
npm --prefix apps/web install
npm --prefix apps/api run db:migrate
npm --prefix apps/api run seed
npm run dev
```

Local dev endpoints:

- Web UI: `http://localhost:5173`
- API: `http://localhost:4000`

For disposable local databases, `npm --prefix apps/api run db:push` can be used as a fast schema-sync fallback. For shared or production-like environments, use versioned Prisma migrations.

## Build And Test

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

Build, test, E2E, automation, and analytics scripts write timestamped logs under `logs/`.

More detail: [docs/BUILD_AND_TEST.md](docs/BUILD_AND_TEST.md).

## Backups

Native JSON export/import is for MakeReadyOS-to-MakeReadyOS operational transfer. PostgreSQL and upload backups are for disaster recovery.

```bash
./backup-db.sh
./backup-uploads.sh
./prune-backups.sh --dry-run
```

Restore scripts are intentionally confirmation-gated:

```bash
./restore-db.sh backups/makereadyos-db-YYYYMMDD-HHMMSS.dump
./restore-uploads.sh backups/makereadyos-uploads-YYYYMMDD-HHMMSS.tgz
```

See [docs/BACKUP_AND_TRANSFER.md](docs/BACKUP_AND_TRANSFER.md), [docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md), and [docs/SCHEDULED_BACKUPS.md](docs/SCHEDULED_BACKUPS.md).

## Documentation

Start here:

- [Product Overview](docs/PRODUCT_OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Architecture Inventory](docs/ARCHITECTURE_INVENTORY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Onboarding](docs/ONBOARDING.md)
- [Build And Test](docs/BUILD_AND_TEST.md)
- [Security](SECURITY.md)
- [Support](SUPPORT.md)
- [Roles And Permissions](docs/ROLES_AND_PERMISSIONS.md)
- [API](docs/API.md)
- [Extensions](docs/EXTENSIONS.md)
- [Operational Library](docs/OPERATIONAL_LIBRARY.md)
- [Property Templates](docs/PROPERTY_TEMPLATES.md)
- [Risk Engine](docs/RISK_ENGINE.md)
- [Vendors](docs/VENDORS.md)
- [Property Maps](docs/PROPERTY_MAPS.md)
- [Frog Pond](docs/FROG_POND.md)
- [Analytics And History](docs/ANALYTICS_AND_HISTORY.md)
- [Workload Planning](docs/WORKLOAD_PLANNING.md)
- [Performance And Scale](docs/PERFORMANCE_AND_SCALE.md)
- [Roadmap](docs/ROADMAP.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)

Contributor-facing docs:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [Open Source Guide](docs/OPEN_SOURCE_GUIDE.md)
- [Feature Status](docs/FEATURE_STATUS.md)
- [Technical Debt](docs/TECH_DEBT.md)
- [UX Debt](docs/UX_DEBT.md)

## Runtime Asset Rule

`reference/` is local research material and is not a runtime dependency. If an asset is used by the app, it must first be copied into a committed runtime-safe path such as `assets/` or `apps/web/public/`.

Current committed runtime assets include OpenDyslexic fonts, Frog Pond assets, and small Font Awesome placeholder icons.

## License

MakeReadyOS is released under the [BSD Zero Clause License](LICENSE), allowing use, distribution, forks, and modifications without attribution requirements.
