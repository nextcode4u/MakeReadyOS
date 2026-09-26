# Turn workflow usability

This work builds on the unit-work-notes checkpoint. It changes presentation and
navigation, not permissions, readiness rules, notification policy, or saved data.

## Implemented

- The board, Kanban, My Work and Assigned Work open the same unit navigation:
  Work & parts, Photos, General notes, Final walk, and All details.
- The initial section follows the turn stage. Editors remain mounted across
  section changes, preserving unsaved entries. Management tools remain available
  in All details rather than filling the default work screen.
- Unit headers show the turn stage. A completed repair stage is not displayed as
  an unexplained green DONE badge when final approval remains outstanding.
- Work shortcuts reach parts/tasks, technician preparation checks and resident
  codes, accounting for the sticky header. Active correction assignments surface
  a prominent shortcut to inspector feedback and the technician resolution.
- The final-walk handoff shows the named inspector, missing assignment, or an
  explicit verification failure. Assignment and readiness information use the
  existing API; an assigned inspection needs no additional send action.
- The obsolete local readiness checklist was removed. The API's blockers remain
  the source of truth, avoiding conflicting lists and false all-clear messages.
- Supplemental tooltips support pointer hover, keyboard focus, Escape and touch.
  Essential next steps, access failures and unsaved-work warnings remain visible.
- Repeated pickup/order instructions and workflow explanations use disclosures.
  Work notes, general updates and inspection corrections have distinct guidance.
- Table filters start collapsed on desktop as well as mobile so units appear
  sooner. Active filter chips and Clear filters remain visible.
- Module names are visible alongside icons. Quick search accepts task terms such
  as parts, cabinet, preparation checks, final walk and codes, within the user's
  existing allowed workspaces. Unit results explicitly describe their loaded-data
  scope rather than implying a global directory search.

## Verification

Browser coverage includes narrow mobile, tablet and desktop widths, retained
work-note/parts drafts across sections, keyboard/touch help, assignment failures,
and authoritative blockers. Existing parts recovery, scope and role-specific
final-walk correction tests remain regression requirements. Desktop coverage also
checks table/Kanban entry, photos, notes, vendor assignment and reference tools.

Validation passed: frontend lint, production builds, 11 targeted status/cue unit
tests and 14 focused browser tests. Desktop/tablet screenshots were inspected.
The full repository-wide browser suite was not rerun for this pass.

## Further opportunities

1. Add a permission-scoped server-backed unit search so a unit can be found even
   when excluded from the loaded board page or active filters. The current task
   search improvement does not make unit lookup global.
2. Offer opt-in role-specific board column presets, reusing Basic board and saved
   views. Preserve personal layouts instead of silently replacing them.
3. Group repair-stage statuses ahead of condition fields in a future drawer-only
   layout. Respect custom column labels and retain access to every condition.
4. Expand role-specific first-use guidance only where observation shows a gap.
   Prefer contextual help over repeated onboarding dialogs or new notifications.
5. Reconcile overlay stacking: opening Alerts while unit details are open can
   leave notifications behind the unit drawer. Preserve drafts and keyboard
   behavior when addressing this; closing unit details first avoids the overlap.

Evaluate follow-up work against newcomer tasks: find a unit, identify who acts
next, record a repair task, collect/order supplies, upload evidence, send a
correction and complete an independent final walk.
