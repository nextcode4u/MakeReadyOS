# Column Meanings

## Source Scope

The exported workbook was inspected for its header layout only. No resident, applicant, unit, or schedule row values are included here.

## Exported Header Layout

The workbook uses one repeated board layout:

| Column | Operational Meaning | Suggested Field Kind |
| --- | --- | --- |
| Name | Unit/turn record identifier | Core identifier |
| Subitems | Linked detail work below the turn | Future task/checklist relation |
| Floor Plan | Unit layout reference | Select or linked floor plan |
| Applicant | Leasing coordination reference | Restricted text/reference |
| Assigned Tech | Responsible active staff member; legacy unmatched text may remain on historical rows | Active user selector for new edits |
| Move-In Date | Scheduled occupancy date | Date |
| NTV / Expected Vacate | Resident notice-to-vacate or expected move-out date | Date |
| New Door Code | Access setup requirement/result | Restricted text/status |
| Vacancy | Vacancy lifecycle state | Colored status |
| Vacated Date | Actual/expected date possession becomes available for operations | Date |
| Date Fail Safe | Derived schedule validation result | Derived status |
| Move-In | Whether move-in is scheduled/active | Boolean/status |
| Make Ready Date | Planned make-ready work date | Date |
| Painting Date | Planned painting date | Date |
| Cleaning Date | Planned cleaning date | Date |
| Ready Date | Expected completion/ready date | Date |
| Paint | Paint scope/result | Colored status |
| Doors | Door work/result | Colored status |
| Completed | Overall turn completion | Boolean/status |
| Sheetrock | Drywall repair scope/result | Colored status |
| Pest | Pest issue type/state | Colored status |
| Pest Treated | Treatment completion/result | Status/date later |
| Trash Out | Trash-out work result | Colored status |
| Floors | Flooring condition/work scope | Colored status |
| Flooring Date | Scheduled flooring work | Date |
| Make Ready | General turn work scope/status | Colored status |
| Cleaning | Cleaning scope/result | Colored status |
| Keys Made | Key/access readiness state | Colored status |
| Cabinets | Cabinet condition/work scope | Colored status |

## Status Vocabulary Seen In References

Common operational values include:

- Completion: `YES`, `NO`, `DONE`, `GOOD`, `NONE`.
- Scope: `EASY`, `LITE`, `MEDIUM`, `MAJOR`.
- Vacancy: `VACANT`, `VACANT LEASED`, `OCCUPIED`, `TO WALK`, `NTV`.
- Paint and repair: `FULL PAINT`, `TOUCH UP`, `NEEDS PAINT`, repair levels.
- Pest: pest type labels plus `TREATED`.
- Flooring: condition and repair/replacement choices.

## Modeling Guidance

- Maintain stable core fields for dates and lifecycle status.
- Present the existing expected move-out date as `NTV / Notice to Vacate`; use `Vacated` for the actual vacancy date so schedule users do not confuse notice timing with possession.
- Use active custom date fields for additional Painting, Cleaning, or Pest schedule tracks until a core field is explicitly justified.
- Use managed built-in colored option sets for standard workflow columns and configurable custom colored fields for property-specific inspection/trade choices.
- Display labels may be adjusted for local terminology, but stable internal field bindings must remain unchanged for automations, transfer exports, and saved records.
- Calendar tracks are configurable presentation bindings to stable built-in or active custom date fields; archive/disable hides a track without deleting source data, and configurable option-driven legends preserve readable status context.
- Treat floor plans as property-owned selectable configuration. A managed selection sources beds, baths, square footage, and description; imported or historic freeform text is surfaced as `LEGACY` until mapped.
- Daily operators may manage display labels, standard/custom choices, and floor plans from compact table header or cell popovers; full Setup remains a secondary administration workspace.
- Renaming a display heading never changes its stable internal key. Renaming a managed choice migrates matching stored values so historic and current presentation remain coherent.
- Protect applicant and access-code data through role permissions and audit history if imported later.
- Do not treat display group names as the only source of lifecycle truth; retain explicit status fields.
- Operational section changes may be performed in batch, but remain auditable moves of existing turns rather than deletion or recreation.
- Calendar colors should mirror the controlling status field where one exists and always retain a text label for accessibility.
## Operational Sections

Each property has standard workflow sections: `Ready Units`, `Make Ready`, `Down Units`, and `Archive`. Display names may be renamed by an operator, but stored section keys remain stable so saved views, automations, activity history, and backup transfer retain meaning. Archive is a workflow destination in addition to the retained archived lifecycle flag.
