# UX Debt

This list captures usability debt without turning it into immediate feature work.

## Dense Table Complexity

- The table is powerful but visually dense for new users.
- Column menus, inline option management, filters, saved views, and batch actions compete for attention.
- Recommended polish: deeper setup-guide completion checks, keyboard cheat sheet, and a “basic mode” saved view preset.

## Mobile Editing Limits

- Mobile uses card/drawer patterns, but the full table remains hard on small screens.
- Batch operations and column configuration are still desktop-first.
- Recommended polish: mobile bulk mode, better drawer bottom actions, and larger field touch targets.

## Dropdown And Option Complexity

- Managed labels, custom options, archived historical values, and inline add/edit flows are powerful but can overwhelm.
- Recommended polish: clearer archived-value display, option previews, and safer confirmation messaging.

## Calendar Configuration Polish

- Schedule tracks are configurable, but the setup mental model still needs simplification.
- Recommended polish: track presets, field compatibility hints, and stronger conflict explanations.

## Dashboard Drilldown Polish

- Dashboard drilldowns apply structured filters, but users may need clearer “why am I seeing this?” context.
- Recommended polish: persistent drilldown banner, save-drilldown-as-view, and better chart row hover states.

## Frog Pond Sprite Limitations

- Frog Pond is useful as a morale/visualization layer and now animates cropped 32x32 sprite-sheet frames with draggable local marker positions.
- Achievement hats/accessories are copied into runtime assets but are not yet connected to operational goals.
- Recommended polish: more committed sprite states, clustering, and preset themes.

## Theme And Accessibility QA

- Light, AMOLED, dyslexia, and eye-strain modes work but need repeated QA as new surfaces are added.
- Recommended polish: theme snapshot checklist and contrast audit before release.

## Drawer Collaboration Polish

- Comments and attachments are functional but operational review could be smoother.
- Recommended polish: image previews, comment edit affordances, attachment grouping, and mention scaffolding.

## Notification Preference Depth

- Preferences are category-based and in-app only.
- Recommended polish: per-property preferences, quiet hours, and future email/push channel settings.

## Operational Library Import UX

- Pack preview/install works but is still technical.
- Recommended polish: setup wizard, field/option mapping UI, and installed-pack detail pages.
