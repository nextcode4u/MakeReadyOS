# Assignment Automation Validation

This guide defines the rollout posture for `assignLeastLoadedStaff`.

## Default Posture

Keep least-loaded auto-assignment starters review-only by default.

Reason:

- Preview math can be deterministic and still be operationally wrong for a real property.
- Staffing coverage, planned-day caps, and supervisor expectations must be confirmed against live work.
- A property that validates cleanly should still not silently change the default for every other property.

## Required Validation Flow

1. Preview the rule for one property only.
2. Confirm preview has no `no eligible staff` blockers.
3. Confirm preview has no `other blocked` items that indicate rule/config mismatch.
4. Install the starter disabled for that same property only.
5. Enable it during a supervised work window.
6. Review at least two recent assignment-aware runs.
7. Confirm supervisors agree the resulting assignment concentration is acceptable.

## Promote A Property To Live Use When

- Preview shows real fresh assignments, not only already-assigned items.
- Preview has `0` no-eligible-staff items.
- Preview has `0` other-blocked items.
- Recent assignment-aware runs are successful.
- Recent assignment-aware runs do not show unexpected warnings or errors.
- The resulting assignments match operator expectations for that property.

## Do Not Broaden The Default When

- Preview shows staffing gaps.
- Daily caps block too much work unexpectedly.
- One user receives most new assignments and supervisors do not expect that concentration.
- Recent runs succeed technically but still produce operationally bad assignments.
- The property requires exceptions or manual babysitting to stay correct.

## Product Support

The Automations workspace now includes an in-product Assignment Rollout Pack that:

- Summarizes preview assignment outcomes
- Summarizes recent assignment-aware run history
- States the current rollout recommendation
- Provides a copyable validation note for operator sign-off

This pack is a decision aid, not a replacement for real-property validation.
