# Mobile Audit Checklist

Use this checklist on a real phone after any major UI change. Priority device baseline: modern Android phone widths similar to a Pixel 8 Pro in normal browser mode.

## Automated Baseline

Before doing the real-device pass, run the mobile smoke lane:

```bash
E2E_BASE_URL=http://localhost:5173 npx playwright test --project=mobile-chrome e2e/mobile-workflows.spec.ts
```

Notes:

- Prefer `http://localhost:5173` over `127.0.0.1` when using the local Vite server so self-hosted origin validation matches the default dev allowlist.
- If Docker is also serving the app on `:8080`, make sure the mobile lane points at the frontend instance that actually contains the current local changes.

This lane currently verifies:

- Mobile shell view/tools switching
- Browser-back drawer and workspace history behavior
- No page-level horizontal overflow across primary mobile navigation
- Quick workflow coverage for Pool Log, Pest Control, Lease Compliance, Projects, Preventive Maintenance, Property Wiki, and Property Maps
- Touch/coarse-pointer devices activate the collapsed mobile shell instead of the desktop toolbar layout

It does not replace the real-phone audit. Use it to catch regressions before the manual pass.

## Core Rules

- First viewport should show usable operational data, not mostly chrome.
- Back button / swipe-back should behave predictably for workspace and drawer transitions.
- Primary actions must stay reachable without precision tapping.
- No sideways page scrolling unless the interaction is intentionally horizontal.
- Phone layouts should hide or collapse desktop-only controls by default.
- Real work should be completable on phone without switching to desktop mode.

## Shell

Verify:

- Header chrome stays compact.
- Search and property selection remain immediately reachable.
- Workspace switching does not consume most of the screen.
- Bottom navigation does not cover important actions or content.
- Alerts, drawers, and modals open above the bottom dock cleanly.

## Make Ready

Verify:

- Unit number is visible before secondary metadata.
- Filters are collapsed by default on narrow screens.
- Board tools that are desktop-only stay hidden or deferred.
- Drawer open/close works with browser back navigation.
- Batch actions do not dominate the viewport unexpectedly.

## Module Pass

Check each of:

- Dashboard
- My Work
- Planning
- Kanban
- Schedule
- Vendors
- Refrigerant
- Pool Log
- Pest Control
- Lease Compliance
- Preventive Maintenance
- Projects
- Property Wiki
- Property Maps
- Automations
- Activity
- Admin / Setup

For every module, confirm:

- Tabs are tappable and scroll cleanly if they overflow.
- Header controls stack without overlap.
- Primary list, table, or card content appears above the fold.
- Quick-capture forms do not require horizontal scrolling.
- Export/report buttons remain reachable but do not crowd data.
- Empty, loading, and error states are readable on phone widths.

## Workflow Pass

For each module, test the real workflow, not just the resting screen.

Verify:

- Open the module from the rail and land on a usable default state.
- Create a new record from the primary mobile entry point.
- Edit an existing record without hidden/off-screen required fields.
- Save changes and confirm success feedback is visible on phone.
- Re-open the same record and verify the change persisted.
- Use browser back / swipe-back during the flow and confirm it returns to the expected prior state.
- Open and close drawers, modals, and detail panels with one hand.
- Upload at least one photo or file when the module supports it.
- Use search, filters, or tabs during the workflow without losing context.
- Confirm destructive actions still require clear confirmation and are not easy to mis-tap.

Suggested workflow coverage by module:

- Make Ready: open unit, update statuses, open drawer, edit notes, close with browser back.
- My Work: open assigned item, complete a quick update, return to list.
- Planning: review day coverage, assign or move work, verify list remains readable.
- Kanban: open card, change status, verify lane behavior and mobile scrolling.
- Schedule: open day/event details, navigate dates, confirm touch targets.
- Vendors: open vendor, create/edit assignment, return to working list.
- Refrigerant: create a quick transaction, select equipment/unit, review history panel.
- Pool Log: create daily entry, add chemical amount, open history/export.
- Pest Control: create request, pick unit/area, update status, close/archive path.
- Lease Compliance: quick capture with photo/evidence, assign issue type, progress notice status.
- Preventive Maintenance: create/edit template or complete task, verify assigned-user flow.
- Projects: quick capture, photo attach, map placement, open detail/report view.
- Property Wiki: search, open record, favorite/unfavorite, open emergency mode.
- Property Maps: open map, select marker/pin, create or edit related pin detail.
- Automations: review preview/run history screens and any mobile form overflow.
- Activity: filter log, inspect rows, clear filters.
- Admin / Setup: open high-risk forms, imports, update/help panels, and long tables.

## Drawers, Panels, And Modals

Verify:

- Close button is obvious and reachable with one thumb.
- Header remains visible while scrolling long content.
- Buttons stack cleanly.
- Form fields become single-column when needed.
- Backdrop tap and browser back both dismiss when appropriate.

## Reporting Issues

Capture:

- Module
- Screen width / device
- Browser
- Theme
- Exact action taken
- Screenshot
- Whether issue is blocking, high, medium, or polish
- Whether the issue is visual only or blocks actual task completion
