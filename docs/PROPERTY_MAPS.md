# Property Maps

Property maps are a local, self-hosted foundation for visual unit navigation. They are intentionally not GIS and do not use Google Maps, Mapbox, or any external mapping service.

## What Exists Now

- `ADMIN` and scoped `MANAGER` users can create/archive property map records.
- Map files can be uploaded as PNG, JPG, WebP, or PDF and are stored in the local uploads volume.
- Map file downloads/previews require authentication and property access.
- Units can be placed on a map with normalized percentage coordinates.
- Unit markers can store optional building, area, and floor metadata.
- Map viewer colors markers by risk level, vacancy status, board section, assigned tech, or make-ready status.
- Clicking a mapped unit marker opens the same operational item drawer when an active make-ready item exists.
- Unmapped units remain visible in the unit directory so setup gaps are obvious.

## Data Model

- `PropertyMap`: property-owned map metadata and optional local file reference.
- `UnitMapLocation`: property/map/unit relationship with x/y percentage coordinates and optional building/area/floor labels.

Coordinates are stored as percentages so uploaded map images can resize in responsive layouts without losing marker placement.

## Permissions

- `ADMIN`: manage all maps and locations.
- `MANAGER`: manage maps and locations for assigned properties.
- `TECH`, `LEASING`, `CLEANER`, `VIEWER`: read scoped maps and open related item details where their normal property access permits it.

## Backup Behavior

Native MakeReadyOS backup includes map metadata and unit marker locations. It does not include large uploaded image/PDF bytes. For full continuity, include the Docker `uploads_data` volume or host upload directory in your disaster-recovery backup plan.

## Current Limits

- PDF maps are stored and downloadable, but the browser editor uses a neutral placement canvas instead of rendering PDF pages.
- There is no full site-map importer yet.
- There is no building/floor hierarchy model yet beyond location metadata fields.
- Dragging markers can be added later; the first editor uses select-unit plus click-to-place for reliability.
- Heatmaps are not persisted yet; marker coloring is calculated from current board/risk state.
