# Public Screenshots

The README images are captured from the real UI using newly created fictional
records in a disposable local database. No production login, database, upload
folder, or server is used. Property, unit, applicant, and staff labels in these
captures are demo examples, not operating-property records.

## Refresh

With Node 24, Docker, and the repository dependencies installed:

```bash
PUBLIC_SCREENSHOTS=1 ./e2e.sh --project=visual-chrome e2e/visual-public-screenshots.spec.ts
```

The capture refuses non-loopback targets and requires the isolated E2E Compose
project. It replaces the PNG files in this directory. Review every image before
publishing; do not substitute a signed-in production browser session.

The old Schedule image is retired. The current month-grid capture was clipped;
review that layout before adding a new Schedule image to public demonstrations.

## Video Guidance

Lead with My Work, unit-specific tasks and parts, then the technician-to-inspector
handoff. Repairs complete and unit ready are different states. Use these images
instead of older screenshots or deployment logs. The README describes optional
modules; a one-minute introduction need not list all of them.

Do not imply that a Docker command handles secure configuration, that all actions
work offline, or that organized photo folders replace backups. If illustrating
an API request, use a documented route with a fictional record ID, not a unit
number presented as a real endpoint.

Replacing repository images does not remove previously generated third-party
videos, cached images, or Git history. Request a fresh generation after publishing
the update and review the resulting media again. Fresh demo fixtures now use
Demo Gardens/Demo Springs, fictional unit IDs, and explicit demo applicant/staff
labels. Legacy board-section identifiers remain supported for existing installs;
this refresh neither rewrites old history nor renames existing property records.
