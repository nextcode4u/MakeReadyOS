# Property Maps

Property maps are a local, self-hosted foundation for visual unit navigation. They are intentionally not GIS and do not use Google Maps, Mapbox, or any external mapping service.

## What Exists Now

- `ADMIN` and scoped `MANAGER` users can create/archive property map records.
- Map files can be uploaded as PNG, JPG, WebP, or PDF and are stored in the local uploads volume.
- Map file downloads/previews require authentication and property access.
- Units can be placed on a map with normalized percentage coordinates.
- Existing unit markers can be dragged to adjust placement without reselecting the unit.
- Unit markers can store optional building, area, and floor metadata.
- Building/area summaries are derived from the unit directory and saved marker metadata. The map can show a building label near mapped units, filter the directory by building, and show mapped/unmapped counts per building.
- Managers/admins can add dedicated building, floor, area, or zone markers to the map. These markers store expected unit counts and coordinates separately from unit markers, which helps irregular properties, skipped building numbers, office buildings, and phased setup.
- Map viewer colors markers by risk level, vacancy status, board section, assigned tech, or make-ready status.
- Clicking a mapped unit marker opens the same operational item drawer when an active make-ready item exists.
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

## Backup Behavior

Native MakeReadyOS backup includes map metadata and unit marker locations. It does not include large uploaded image/PDF bytes. For full continuity, include the Docker `uploads_data` volume or host upload directory in your disaster-recovery backup plan.

Map area markers are included in native backup/transfer because they are lightweight configuration data. Uploaded map image/PDF bytes remain outside the JSON backup.

## Current Limits

- PDF maps are stored and downloadable, but the browser editor uses a neutral placement canvas instead of rendering PDF pages.
- There is no full site-map importer yet.
- There is no full building/floor hierarchy table yet; the current foundation uses unit-directory metadata plus persisted map area markers so simple properties, irregular building numbers, skipped office buildings, and mixed unit counts work without a rigid schema.
- Marker dragging updates the same saved percentage coordinates as click-to-place. There is no bulk layout/import tool yet.
- Heatmaps are not persisted yet; marker coloring is calculated from current board/risk state.
