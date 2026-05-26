# Frog Pond

Frog Pond is a whimsical operational visualization inspired by monday.com's llama farm. It does not replace the table, dashboard, schedule, or item drawer. It gives managers and teams a quick visual read on live make-ready conditions.

## Runtime Assets

Raw frog reference files live under ignored local `reference/resources/Frogs/`.

Runtime-safe assets copied into the committed app tree:

- `assets/frogs/ponds/pond-03.png` through `pond-15.png`
- `assets/frogs/sprites/` selected frog sprite sheets, accessory/hat sheets, spritesheet guide, and license
- `assets/frogs/tadpoles/` selected tadpole sprites
- `assets/frogs/decor/fly.png` decorative vertical two-frame fly sheet

The app never imports or serves `reference/` directly. Frog markers use the committed frog/tadpole runtime assets with CSS cropping and fallbacks. Frog sheets are treated as 32x32 tile grids; rendering cycles through selected frame rows and leaves the surrounding sheet hidden.

## Data Sources

Frog Pond uses the same permission-scoped make-ready item payload as the board. Config options are browser-local initially:

- frogs represent active turns, high/critical risk, assigned workload, vacant/NTV units, or move-ins this week
- groups can be property, board section, risk level, or assigned tech
- colors can derive from risk level, vacancy status, make-ready status, or property
- max visible frogs limits rendering and clusters overflow
- dragged frog/tadpole positions are stored as local browser preferences
- animation can be paused with a single Animation toggle
- presets can be saved locally per browser
- numbered pond backgrounds are selectable by the end user from the committed pond set
- pond images stretch to fill the scene frame, prioritizing full-frame detail over original aspect ratio

## Interaction

- Clicking a frog opens the shared item drawer.
- Dragging a frog or tadpole lets an operator place it on the lower pond surface.
- Animated mode cycles horizontal frog sprite-sheet runs, randomizes compatible animation rows per frog, lets frogs make short hop motions, and cycles tadpole images `1` through `6` for a swim effect. A frog makes a small one-time evade jump when the pointer reaches it; a tadpole swims away instead of jumping, while the marker remains clickable.
- Decorative flies occasionally loop and drift through the pond using the committed vertical fly sheet. Flies do not represent operational data, are pointer-transparent, and disappear if they pass close enough to a frog marker.
- Clicking a group chip in the pond summary applies a table drilldown when possible.
- The dashboard includes a preview card that opens Frog Pond.
- Group totals are shown in a summary/legend below the pond instead of as floating labels over the scene.
- Hat/accessory sheets are copied for future achievement unlocks, but the first implementation keeps hats reserved so they do not clutter daily operations.

## Accessibility And Performance

Labels and tooltips accompany colors so status is not color-only. Rendering is capped by `max visible frogs` to avoid heavy animation or large DOM counts. Movement is bounded to the lower pond area so markers do not float over sky/background zones. Use the `Animation` toggle to pause or resume pond motion.

Frog placement is constrained to the lower portion of the pond scene so markers feel like they sit on the water/shore instead of floating over the sky. Marker z-index is intentionally below the shared item drawer.

## Backup Behavior

Frog Pond configuration is currently local browser preference data, so native JSON backup does not include pond presets. The copied runtime assets are part of the repository/build, not backup data. If server-side shared pond presets are added later, they should be included in native backup as safe configuration only.
