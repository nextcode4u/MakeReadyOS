# Property Maps

Property maps are a local, self-hosted foundation for visual unit navigation. They are intentionally not GIS and do not use Google Maps, Mapbox, or any external mapping service.

## What Exists Now

- `ADMIN` and scoped `MANAGER` users can create/archive property map records.
- Archived property maps can now be permanently deleted from Map Setup when a duplicate upload or retired layout should be removed completely.
- Shared pins, map areas, and unit placements now follow that same safer lifecycle pattern instead of stopping at one-way archive: active records stay on the live map, archived records move into restore buckets inside the workspace, and permanent delete is blocked until the record is archived first.
- Map Setup now also distinguishes between a map record that exists with no file uploaded yet versus a PDF map that is stored but not rendered inline, so “blank” map states no longer all read like a failed upload.
- Map files can be uploaded as PNG, JPG, WebP, or PDF and are stored in the local uploads volume.
- Map file downloads/previews require authentication and property access.
- Units can be placed on a map with normalized percentage coordinates.
- Existing unit markers can be dragged to adjust placement without reselecting the unit.
- Unit markers can store optional building, area, and floor metadata.
- Building/area summaries are derived from the unit directory and saved marker metadata. The map can show a building label near mapped units, filter the directory by building, and show mapped/unmapped counts per building.
- Unit placement now includes a next-unmapped assist. When placing units, Map Setup shows how many units remain unmapped for the current building/property, offers a direct `Next Unmapped` shortcut, and auto-advances to the next unmapped unit after each successful placement.
- Map Controls now also support an `Unmapped only` filter for the setup list and unit picker, so supervisors can work through placement gaps without scrolling past already-mapped units.
- Selected building/area markers can now jump directly into unit-placement mode for that area. The workflow automatically turns on the area filter, enables unmapped-only mode, and preloads the first unmapped unit so setup can continue from the map itself.
- Selected building/area markers now also show area-specific total, mapped, unmapped, and next-unit context in the detail panel, and the placement shortcut disables itself when nothing is left to place.
- Building/area summary chips now prioritize incomplete areas first, show explicit unmapped counts, and the controls panel exposes a `Go To Next Gap` shortcut so map setup behaves more like a placement queue than a static summary list.
- Those same summary chips now visually distinguish incomplete versus fully mapped areas, so supervisors can spot remaining setup work without reading every chip count.
- Map Controls now also support `All`, `Unmapped only`, and `Mapped only` list scopes for the side unit list and placement picker, so setup, cleanup, and verification can happen from the same workspace without mixing every unit into one scroll.
- That same `List scope` selector now shows live counts for all, unmapped, and mapped units, so supervisors can tell immediately whether a building still has placement gaps before changing views.
- Map Setup also includes a `Copy visible queue` action that copies the currently filtered building/unit placement list to the clipboard, which gives teams a lightweight bulk setup/export aid without introducing a heavier importer first.
- Map Setup now also supports lightweight bulk unit placement import from pasted CSV/TSV/semicolon-delimited text using `unit,xPercent,yPercent,building,area,floor` columns, with preview/error feedback before locations are saved through the normal placement API.
- The currently filtered unit placement queue can also be exported directly as CSV from Map Controls, which gives setup teams a quick review/share path for one building, one scope, or the whole visible property without needing a separate backend report first.
- Dense marker collisions are now easier to reason about during setup and field review: the map header reports how many visible overlap clusters remain, and overlap groups render a badge with the shared marker count on the cluster lead instead of only relying on slight spread offsets.
- Building/area markers now share the same lightweight bulk setup path as unit markers: Map Controls can export visible area markers as CSV and can paste-import `name,areaType,xPercent,yPercent,color,expectedUnitCount,notes` rows with preview/error feedback before creating markers through the normal API.
- Managers/admins can add dedicated building, floor, area, or zone markers to the map. These markers store expected unit counts and coordinates separately from unit markers, which helps irregular properties, skipped building numbers, office buildings, and phased setup.
- Map viewer colors markers by risk level, vacancy status, board section, assigned tech, or make-ready status.
- Clicking a mapped unit marker opens the same operational item drawer when an active make-ready item exists.
- Selected map units, areas, and shared pins can open prefilled recommendation capture in Projects, and the same map context can open a prefilled Pest Control quick-add request for fast field follow-up.
- Dense marker clusters now spread slightly on the canvas instead of rendering as a single unreadable stack when several units/pins share the same area.
- Shared map pins can now store local photo/PDF attachments for visual field context without forcing that information into a separate project or wiki record.
- Unmapped units remain visible in the unit directory so setup gaps are obvious.

## Data Model

- `PropertyMap`: property-owned map metadata and optional local file reference.
- `PropertyMapArea`: property-owned building/area/floor/zone marker on a map with x/y percentage coordinates and optional expected unit count.
- `UnitMapLocation`: property/map/unit relationship with x/y percentage coordinates and optional building/area/floor labels.

Coordinates are stored as percentages so uploaded map images can resize in responsive layouts without losing marker placement.

## Permissions

- `ADMIN`: manage all maps and locations.
- `MANAGER`: manage maps and locations for assigned properties.
- `TECH`, `LEASING`, `CLEANER`, `VIEWER`: read scoped maps and open related item details where their normal property access permits it.

## Delete Behavior

- Property maps must be archived before they can be deleted.
- Shared pins, map areas, and unit placements must also be archived before they can be deleted permanently.
- Map Setup now shows the selected map's active/archived state directly above the action buttons and explains when permanent delete becomes available, so operators do not have to guess whether delete is missing or intentionally gated.
- Deleting a property map also removes its uploaded map file, unit markers, area markers, shared pins, and pin attachments through the normal cleanup path.
- Linked Projects records and Lease Compliance issues are preserved, but their map link and stored pin coordinates are cleared so those records stay usable after the map is removed.

## Backup Behavior

Native MakeReadyOS backup includes map metadata and unit marker locations. It does not include large uploaded image/PDF bytes. For full continuity, include the Docker `uploads_data` volume or host upload directory in your disaster-recovery backup plan.

Map area markers are included in native backup/transfer because they are lightweight configuration data. Uploaded map image/PDF bytes remain outside the JSON backup.

## Current Limits

- PDF maps are stored and downloadable, but the browser editor uses a neutral placement canvas instead of rendering PDF pages.
- There is no full site-map importer yet.
- There is no full building/floor hierarchy table yet; the current foundation uses unit-directory metadata plus persisted map area markers so simple properties, irregular building numbers, skipped office buildings, and mixed unit counts work without a rigid schema.
- Marker dragging updates the same saved percentage coordinates as click-to-place. There is no bulk layout/import tool yet.
- Heatmaps are not persisted yet; marker coloring is calculated from current board/risk state.
- Shared map pin attachments still rely on the normal uploads backup path for file bytes; native transfer preserves attachment metadata only.
