# Operating Calendars

Operating calendars are property-scoped scheduling guardrails. They describe when work should normally be planned and can now be used by explicit structured automation actions that populate downstream date fields.

## What They Store

Each property can have one operating calendar with:

- Calendar name and timezone.
- Maintenance operating start and end time.
- No-weekend scheduling preference.
- Optional Monday and Friday avoidance.
- Vendor lead-time days.
- Optional daily scheduled-unit limit.
- Optional scope day and work-start day.
- Optional notes for local scheduling policy.
- A flag indicating whether date auto-population is allowed for the property.

If a property does not have a saved operating calendar, the API returns safe defaults so Setup can still display one.

## Where To Configure

Admins and managers configure operating calendars from `Setup -> Operations` for properties they can manage.

Operating calendars are intended to support workflows such as:

- Avoiding weekend make-ready, vendor, cleaning, or final-walk dates.
- Avoiding extra scheduled work on Mondays or Fridays when a property chooses that policy.
- Reminding staff to contact vendors a set number of days before expected vendor work.
- Keeping daily scheduled turns within a realistic unit count.
- Supporting scope-day then work-day patterns.

## Automation Date Offsets

Operating calendars never rewrite dates by themselves. Admins or managers must create, preview, and enable a structured automation rule that uses the `setDateFromField` action.

The action calculates a target date from a source date plus or minus a whole number of operating days. It currently supports these built-in date fields:

- `moveOutDate`
- `vacatedDate`
- `makeReadyDate`
- `flooringDate`
- `moveInDate`

When `respectOperatingCalendar` is enabled, the action skips weekends and avoids Mondays or Fridays according to that property's operating calendar. Example: a Friday make-ready date plus one operating day becomes Tuesday when weekends and Mondays are blocked.

The first bundled auto-population template is `Auto-Populate Flooring Date From Make-Ready`. It installs disabled by default and should be previewed before enabling.

## What They Do Not Do Yet

Operating-calendar date offsets do not yet enforce daily scheduled-unit limits, vendor-assignment-specific calendars, or move-in deadline backtracking. Use the preview and run history before enabling date-changing rules.

## Backup And Transfer

Native MakeReadyOS JSON backup includes operating-calendar configuration by property code. Import is merge-only and duplicate-safe: an existing destination calendar for a property is kept unless a future explicit overwrite mode is added.

## Safety Notes

- Operating calendars are configuration, not arbitrary code.
- They are property-scoped and follow existing manager/admin permissions.
- They do not replace the Schedule view; they guide future schedule automation and review workflows.
- Date-changing rules are structured, auditable, previewable, and never execute arbitrary JavaScript.
