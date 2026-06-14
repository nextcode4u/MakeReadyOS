# Roles And Permissions

MakeReadyOS roles are operational roles, not just UI labels.

## Roles

- `ADMIN`: full system access, users, properties, fields, options, automations, library packs, backups, activity, and all board data.
- `MANAGER`: property-scoped management for assigned properties, board setup, fields/options, automations, library packs, activity, and operational board edits.
- `TECH`: assigned maintenance execution, work-status fields, comments/photos, checklist completion, My Work, and dashboard visibility.
- `LEASING`: scoped operational read access plus leasing-facing updates such as applicant, NTV/vacated/move-in dates, vacancy status, and comments.
- `CLEANER`: scoped cleaning execution, cleaning/make-ready completion fields, comments/photos, checklist completion, and My Work.
- `VIEWER`: read-only scoped access.

## Implementation Notes

The API keeps a centralized permission matrix in `apps/api/src/lib/auth.ts`. Frontend role behavior mirrors that matrix for navigation and affordances, but API checks remain authoritative.

The current field-edit boundary is intentionally practical:

- `ADMIN` and `MANAGER` can edit all make-ready board fields.
- `TECH` can edit maintenance/work execution fields.
- `LEASING` can edit leasing/date/vacancy fields.
- `CLEANER` can edit cleaning execution fields.
- `VIEWER` cannot mutate board fields.

Property scoping still applies to every non-admin role through `UserPropertyAccess`.

Each user also has a language preference. The current supported interface languages are English (`en`) and Spanish (`es`). Administrators can set a user's language in User Management, and signed-in users can switch their own language from the top toolbar. The API stores this preference on the user record; role and property permissions do not change by language.

Risk visibility follows existing board/dashboard visibility. `ADMIN` and `MANAGER` can run risk evaluation and generate deduped risk notifications; other roles can see scoped risk indicators on work they can already access but cannot trigger system-wide evaluation.

Vendor management follows the same operational boundary: `ADMIN` and scoped `MANAGER` users manage vendor records and vendor assignments; `TECH` users can view vendor work and update assignment execution status where permitted; `LEASING`, `CLEANER`, and `VIEWER` do not manage vendor records.

Preventive Maintenance follows a role-derived workflow boundary instead of a separate permission matrix. `ADMIN` users have full PM access. Scoped `MANAGER` users can manage PM templates, complete PM tasks, and view PM reports. `TECH` and `CLEANER` users can view and complete scoped PM tasks, including attachments and required notes/pass-fail outcomes. `LEASING` and `VIEWER` users can read scoped PM data but cannot create templates or complete tasks.

Refrigerant tracking has its own operational boundary. `ADMIN` users can view, edit, and administer refrigerant types. `MANAGER` and `TECH` users can view and edit refrigerant cylinders and unit refrigerant transactions. `VIEWER` users can read scoped refrigerant records. `LEASING` and `CLEANER` users do not see or access the Refrigerant workspace. Managers/admins can dismiss repeated-addition leak flags with notes.

Property map management is restricted to `ADMIN` and scoped `MANAGER` users. `TECH`, `LEASING`, `CLEANER`, and `VIEWER` can view property maps and mapped units only within their normal property access.

Workload planning uses the normal property scope rules. `ADMIN` and scoped `MANAGER` users can create and replan in-house work blocks. Operational users can view scoped planning data; the assigned user can update limited execution status and notes on their own planning block. Hour-based capacity is intentionally not exposed in the current UI.

Property templates follow setup-management permissions. `ADMIN` users can create templates from any property and apply a template to a new or existing property. `MANAGER` users can create templates from assigned properties and apply templates only to assigned existing properties. `TECH`, `LEASING`, `CLEANER`, and `VIEWER` cannot list, create, or apply property templates.

The first-run setup guide is visible to `ADMIN` and `MANAGER` users because it links to property/unit setup, templates, automations, schedule tracks, and staff configuration. It is guidance only; the linked workspaces still enforce their normal API permissions.

## Future Permission Work

The matrix is prepared for deeper per-field permissions later, including property-level overrides, custom-field-specific edit rights, vendor roles, and checklist-template-specific assignment rules.

## Integration Permissions

Only `ADMIN` users can create, view, and revoke API tokens or webhook endpoint registrations. API tokens inherit the creating user's role/property permissions and are further limited by explicit token scopes and optional property scope.

API tokens cannot access admin-only management endpoints, including token creation and user management. Use short, purpose-specific scopes instead of broad write tokens.
