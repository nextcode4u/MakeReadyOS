# Living Pond

Local implementation, not deployed. The pond remains a decorative view of accessible board data, never a task editor or a completion gate.

## Interaction

- Three stationary pixel pads define each adult frog's local route; the frog no longer carries a pad. Tadpoles retain curved swimming routes. Creature IDs deterministically assign curious, sleepy, shy or energetic personalities, changing rest/travel cadence independently of work risk. These identities survive reloads without storing additional staff data.
- Food selection is species-specific: flies attract adult frogs, algae flakes attract tadpoles. The selected creature's Offer action chooses the appropriate food automatically. Incompatible creatures never join the snack group.
- A selected-creature panel exposes personality, feeding and individual unlocked outfits alongside the existing Open unit action. Individual wardrobe overrides persist in the viewer's browser collection. Natural pond clears all overrides; returning a single frog to Pond default removes only that override. Tadpoles have no hat selector.
- The scrapbook displays outfit previews, hints and timestamps for newly observed discoveries. Legacy discoveries without stored dates are labeled honestly rather than backdated. Data remains browser-local, not synchronized to the server.
- Pond-only view hides the pond's summary/settings/legend panels while retaining play controls and unit access. Exit pond-only view and Escape restore the normal view; Escape returns focus to the toggle. It is not browser fullscreen, and global app navigation remains available.

- Natural pond is strictly accessory-free (plain green/brown frogs), independent of assignment, risk or readiness. Hats only appear when an unlocked outfit is selected. Rodeo frogs unlocks at a peak of three simultaneously ready accessible units and uses the cowboy sheet; unlocking never auto-equips it. Returning to Natural pond removes hats without losing unlocks.

- Creatures follow bounded, seeded paths. Frogs rest between legs; tadpoles swim curved paths with pauses. Hover/focus holds a creature still so it remains selectable. Arrange mode retains manual placement.
- Tap a creature for a greeting and an explicit Open unit action. Tadpoles bubble (bloop), nibble, and do not catch airborne flies or ribbit. Nearby creatures react to a greeting; frogs also nap and use the existing animated sprite sequences.
- Fly catches use a short visible sequence rather than instant collision removal: the nearest awake, available frog within 36 screen pixels extends a tongue, the fly retracts toward its mouth over two ticks, and a nom/chewing reaction remains for five ticks. Each frog handles one catch at a time. Motion pause clears transient catches. Sleeping frogs and tadpoles do not hunt.
- Lily pads and ripples use local crisp-edged pixel artwork at integer scale rather than rounded gradients; pad bobbing moves in pixel steps without rotational blur.
- Tap the water to place food. The nearest three creatures approach it and return; only those guests eat. The Feed the pond button is a keyboard-accessible alternative. Feeding never edits board records.
- Unit labels default to hover/tap/focus; Always visible remains available. Accessible names retain unit/property/status regardless of visual label mode.
- Lighting follows the browser's local hour, with manual day/dusk/night choices. Fireflies appear at dusk/night. Decorative rain is occasional, forced on, or disabled; it is not a real weather feed.
- A dragonfly visits after about a minute of active pond time. Discovering it unlocks Dragonfly dusk cosmetics. The journal provides hints for greetings, feeding and visitors. Collections are per-user browser storage, not server-synchronized achievements.
- A not-ready to ready transition observed while the pond is mounted produces a brief celebration. Initial historical readiness does not replay celebrations. Existing peak-ready rewards persist; this is not a historical completion ledger.
- Optional short synthesized greeting/bubble sounds require explicit enablement each visit. No autoplay, remote audio assets, or background music. Tadpoles use the bubble tone, not the frog tone.

## Motion And Reliability

Reduced motion, hidden tabs, Pause and Arrange stop the animation clock; the existing explicit device-preference override remains available. Fly collision filtering preserves state identity when no fly was caught, avoiding repeated updates from fresh render arrays. Journeys and visitors use the same clock, and snack expiration handles its wraparound. Audio nodes disconnect after playback and the context closes on unmount.

## Verification

Focused production-image browser tests cover bounded paths, tadpole greetings, nearby snack movement, label visibility, decorative weather, visitor persistence, ready transitions, default-muted sound controls, no work-record mutations, and reduced-motion restoration. See the release checkpoint in RELIABILITY_POLISH.md for results. Real audio output should also be checked on the target phone; automated tests do not establish perceived sound quality.
