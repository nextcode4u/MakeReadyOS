# Missing units after move-in

In Setup's availability importer, select **Full property report** and enter the
report's date to reconcile units missing from a complete, unfiltered report.
Review the proposed unit numbers and confirm before importing.

Only ready units with a move-in date before the report date qualify for the
move-in reconciliation described below. The report
cannot be future-dated. Down/model units, pending final walks, inactive units,
ambiguous active turns, listed units (including leading-zero equivalents), and
turns edited after the report date are excluded.

Confirmed candidates become occupied in the unit directory. Their completed
turns move to the property's Archive section, retaining dates and work history.
An audit entry records that occupancy was inferred from the report, the actor,
report date, and previous values. Pending final-walk assignments are cancelled,
not certified as performed inspections.

Partial imports do not reconcile omissions. Empty reports are not accepted.
If the report or candidates change after preview, preview again. Import and
archive updates share a serializable transaction; audit failure rolls them back.

Other missing active turns can be reviewed separately for explicitly confirmed
occupancy or a canceled move-out. They are not selected by default: absence alone
is not proof of occupancy. Confirmed closures retain resident details and do not
approve unfinished repairs. Unselected turns remain active.

For a renewal, instead open the turn's **Record renewal / cancel turn** form and
record the new lease end date. Importing All Units `.xls` can populate resident
lease dates, but a directory refresh alone does not override availability or
silently cancel a turn. See [Resident imports](RESIDENT_IMPORTS.md).
