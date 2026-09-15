# Preventive maintenance quick start

Managers and admins can open Preventive Maintenance, select a property, and
expand **Quick start: inspection logs and recurring maintenance**.

- Starters: lighting, general property, landscape sprinklers, unit inspections,
  warranty reviews, HVAC/filters, gates/access, roof/drainage observations,
  fire-safety visual checks, and equipment service reviews.
- Frequencies: daily, weekly, every two weeks, monthly, quarterly, every six
  months, annually, or a custom 1-365 day interval. Set the first due date.
- Unit inspections use the selected property's active unit directory. Choose a
  date window and weekdays, preview every unit, adjust dates, then apply.
  Dates are spread by building and unit. Property entry/notice requirements and
  staffing must be checked before applying. Repeat cycles retain the scheduled
  dates, not the completion dates; future monthly cycles may fall on weekends.
- Enable creates the next task for each schedule. Completing/skipping generates
  the next occurrence. Calendar shows these persisted next tasks, not an unlimited
  future projection. Late completion does not silently skip missed cycles.
- Reapplying updates open due dates without duplicating templates or rewriting
  completed history. Pausing retains open tasks but prevents future recurrence.
- Re-preview after adding directory units to include them. Archived units do not
  generate new inspection tasks; existing work/history remains available.
- Templates contains assignments, editable instructions, priority and evidence
  requirements. Inspection starters require notes and pass/fail by default;
  warranty reviews require notes without pass/fail.

These are editable operational starting points, not certified inspection forms.
Warranty reviews are recurring logs, not automatic asset expiration tracking.
Landscape irrigation and fire-safety checks are explicitly separate.

Migration `20260915210000_pm_starters` adds stable starter keys, unit links and
first due dates. Portable backups preserve these fields and remap unit links by
property code and unit number.
