# Preventive Maintenance

Preventive Maintenance is a first-class MakeReadyOS module for recurring property tasks. It is meant for operational routines such as filter changes, seasonal inspections, safety checks, housekeeping rotations, and recurring equipment walkthroughs without turning the product into a full CMMS or work-order platform.

## What It Tracks

- Property-scoped recurring templates for daily, weekly, biweekly, monthly, quarterly, semi-annual, annual, and custom every-X-day tasks.
- Seasonal annual tasks with explicit month/day scheduling.
- Template fields for category, description, instructions, assigned role, priority, and required completion evidence.
- Optional user-level assignment inside the selected assigned role so a property can target a specific tech, manager, cleaner, or other eligible staff member.
- Generated due tasks with status, due date, completion outcome, notes, and attachment history.
- PM history records that remain visible after completion or skip.
- Property Wiki references for templates and active tasks.

## Template Fields

Each template can store:

- name
- category
- description
- instructions
- frequency
- custom interval days
- annual month/day
- assigned role
- assigned user
- priority
- photos required flag
- notes required flag
- pass/fail required flag
- active/archive state

The current foundation is property-specific rather than portfolio-global. Templates are meant to be simple operational standards, not approval-controlled maintenance programs.

## Task Lifecycle

MakeReadyOS keeps PM execution lightweight:

- active templates generate open due tasks
- completing or skipping a task creates the next occurrence
- completion can require notes, photos, or pass/fail outcome based on the template
- history is retained and not deleted as part of ordinary PM use

This keeps recurring work visible without requiring a separate scheduler service. The product decision is to keep PM request-driven and completion-driven rather than adding a background pre-generation daemon. Every PM overview, task, and calendar read ensures an open task exists for each active template, and each completion or skip immediately creates the next occurrence.

## Permissions

- `ADMIN`: full PM visibility, template management, task completion, exports, and report access.
- `MANAGER`: property-scoped PM visibility, template management, task completion, exports, and report access.
- `TECH`: property-scoped PM visibility, task completion, attachment upload, and history access.
- `CLEANER`: property-scoped PM visibility, task completion, attachment upload, and history access.
- `LEASING` and `VIEWER`: read-only PM access.

All PM data follows the existing property access restrictions used elsewhere in MakeReadyOS.

## Views

The PM module currently includes:

- Dashboard
- Calendar
- Tasks
- Templates
- History
- Reports

The dashboard emphasizes overdue work, due-soon work, recent completions, and completion rate. Calendar and task views are mobile-friendly and compact-mode safe.

## Property Wiki Integration

PM templates and tasks can attach Property Wiki references instead of duplicating site knowledge. This allows recurring tasks to point at:

- SOPs
- equipment information
- known issues
- emergency context
- photos and documents

The current integration uses the same reusable workflow-reference model as other modules.

## Reports And Exports

PM includes:

- CSV export
- Excel-compatible export
- printable browser report
- OpenAPI-documented `/api/pm` overview, template, task, calendar, history, attachment, and export endpoints for self-hosted integrations

These exports are intended for operational review, supervisor follow-up, and simple compliance documentation.

## Notifications

PM uses in-app notifications only. Near-term due tasks can generate manager/admin review visibility through the existing notification system.

When a template targets a specific assigned user, PM can also surface direct in-app ownership for that user while still preserving the broader role classification for reporting and routing.

Email, SMS, push, and external maintenance dispatch are not part of this foundation.

## Current Limits

- Native backup/export now includes PM templates, generated tasks, attachment metadata, and PM Wiki references.
- Uploaded PM file bytes remain local upload storage and are not embedded in native JSON transfer, so destination downloads still depend on the normal upload backup/restore path.
- PM Wiki references restore only when the destination can resolve the referenced Wiki target.
- No standalone background scheduler exists by design. Recurring generation is request-driven and completion-driven, which keeps deployment simpler while still ensuring active templates always surface an open task when PM views are used.
- No approval workflow, vendor dispatch engine, inventory management, or accounting layer is included.
