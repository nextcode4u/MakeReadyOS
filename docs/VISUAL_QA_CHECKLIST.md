# Visual QA Checklist

Use this checklist after major UI changes, especially when new dense panels or forms land.

## Capture Baseline

Generate the desktop visual review bundle before doing subjective sign-off:

```bash
E2E_BASE_URL=http://localhost:5173 npx playwright test --project=visual-chrome e2e/visual-qa-capture.spec.ts
```

The capture lane writes review screenshots to:

```text
test-results/visual-qa/
```

Current capture coverage includes:

- `Default`
- `Light`
- `Eye-Strain`
- `Dyslexia`

Across:

- Make Ready table
- Dashboard
- Projects
- Pest Control
- Lease Compliance
- Preventive Maintenance
- Property Wiki
- Property Maps
- Admin

## Theme Pass

Verify each workspace in:

- `Default`
- `AMOLED`
- `Light`
- `Eye-Strain`
- `Dyslexia`

Confirm:

- No horizontal page overflow.
- Labels, inputs, pills, and helper text remain readable.
- Active tabs/buttons stay visually distinct from inactive states.
- Borders remain visible against panel backgrounds.
- Sticky table columns do not show translucent bleed while scrolling.
- Disabled states still look intentionally disabled instead of broken.

## Density Pass

Verify both normal and compact mode on:

- Make Ready table
- Dashboard
- Automations
- Projects
- Pest Control
- Lease Compliance
- Property Maps
- Property Wiki
- Admin

Confirm:

- Headings do not collide with field rows.
- Inline forms keep labels aligned with controls.
- Tables wrap at word boundaries instead of splitting single letters.
- Action buttons stay visible without overlapping adjacent inputs.
- Left rail icons remain legible in dark and light themes.

## Mobile/Narrow Width Pass

Check the main operational workspaces around tablet and phone widths.

Confirm:

- Primary actions remain on screen.
- Form rows stack cleanly.
- Searchable selects remain usable without hidden overflow.
- Quick-capture forms keep the submit action reachable.
- Large preview panels do not force sideways scrolling.

## Workflow-Specific Checks

### Automations

- Preview panels show warnings, assignment diagnostics, and rollout-validation state.
- Least-loaded templates require property scope before install.
- Preview and run-history text remains readable in Light mode.

### Projects / Maps / Photos

- Existing records can be placed on a selected map without layout breakage.
- Photo-first capture actions remain visible and obvious.
- Attachment metadata editors do not overlap neighboring controls.

### Pest / Lease / PM / Pool / Refrigerant

- Quick-add forms align cleanly across the first visible rows.
- Unit selectors remain searchable where long unit lists exist.
- Export/report actions stay visible in compact mode.

## Sign-Off Notes

When a pass finds issues, capture:

- Workspace
- Theme / compact state
- Screen width
- Exact control or panel
- Screenshot
- Whether the issue is blocking, polish, or follow-up
