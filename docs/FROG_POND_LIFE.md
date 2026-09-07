# Living Pond

Local implementation, not deployed. The pond remains a decorative view of accessible board data, never a task editor or a completion gate.

## Interaction

- Creatures follow bounded, seeded paths. Frogs rest between legs; tadpoles swim curved paths with pauses. Hover/focus holds a creature still so it remains selectable. Arrange mode retains manual placement.
- Tap a creature for a greeting and an explicit Open unit action. Tadpoles bubble (bloop), nibble, and do not catch airborne flies or ribbit. Nearby creatures react to a greeting; frogs also nap and use the existing animated sprite sequences.
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
