# Scope and Make Ready Status

Make Ready Status already contains EASY, LITE, MEDIUM and MAJOR alongside workflow values such as TO WALK, DONE and FINAL WALK. Asking for Scope separately duplicated the same assessment.

Selecting one of those four scope statuses now saves `scopeLevel` automatically. This applies to turn creation, individual edits, bulk status edits, status-setting automations and availability imports. A recognized status wins over a conflicting scope supplied in the same request.

The separate Scope entry was removed from turn creation and Turn Details. The optional board Scope column is read-only; filters and analytics still use the saved field. Advancing to DONE or FINAL WALK (or selecting a custom status) does not erase the saved scope. DONE still means repairs complete, not approval of the whole turn.

Existing records are not rewritten. Legacy/custom scope values and backup round trips remain supported. Custom status names do not infer a scope. There is no database migration.
