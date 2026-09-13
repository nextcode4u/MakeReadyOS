# Missing units after move-in

In Setup's availability importer, select **Full property report** and enter the
report's date to reconcile units missing from a complete, unfiltered report.
Review the proposed unit numbers and confirm before importing.

Only ready units with a move-in date before the report date qualify. The report
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
