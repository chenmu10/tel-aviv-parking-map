# חניוני אחוזת החוף תל אביב (Tel Aviv Parking Map)

A static site showing live parking-lot availability for Tel Aviv's
Ahuzot HaHof coastal parking lots on a map, color-coded by status
(available / few spaces / full / closed). UI is Hebrew-first, with English
in parentheses for the mixed Hebrew/English audience it's built for.
No build step: plain HTML, CSS, and native ES modules, served as-is.

Live: https://chenmu10.github.io/tel-aviv-parking-map/

## Screenshots

| Live map | Lot popup |
|---|---|
| ![Live availability map](docs/screenshots/map-overview.png) | ![Lot popup with status, capacity, tariffs, nearby lots and share](docs/screenshots/popup-detail.png) |

## Features

- Live availability map with color-coded status pins, filtered to exclude closed lots
- Resident-discount badge (-50%/-75%) on each pin where a discount applies
- Lot-name labels appear once zoomed in enough to read them
- Collapsible legend explaining the status colors
- Each lot's popup leads with availability: name, status badge, address and how
  long ago the source updated it (with a stale-data warning past 30 minutes),
  then navigation buttons and capacity/resident-discount chips. Tariffs, the
  exact update time and the official-page link fold into a "פרטים נוספים
  ומחירון" expander
- "חניונים קרובים": the 3 nearest not-full lots in every popup, each with a
  direction arrow pointing the real-world way to it; tap to jump to them
- Address search: type an address, pick a suggestion, and the map zooms there
  and opens the nearest lot with room (within 3 km)
- Report wrong data to the operator: a flag button in each popup opens a
  "what's wrong?" chooser and prepares a Hebrew report (lot number, GIS oid,
  status shown, both timestamps). Nothing is sent automatically — it opens as
  a Gmail draft to review; users without Gmail get a link to ahuzot.co.il's
  contact form
- One-tap navigation to a lot via Waze or Google Maps (by exact coordinates)
- Share button per lot (native share sheet / copy link) with `#lot=<id>` deep
  links that open the shared lot's popup directly
- Freshness pill showing when the source data last changed, with a manual
  refresh button and an outage state when the feed serves no statuses
- A link to the lot's official ahuzot.co.il page when one can be matched by name
- "Center map on my location" button; map view (center+zoom) persists across
  reloads for 2 hours, so a Waze round-trip returns you where you were but a
  fresh visit later starts at the city overview
- Hebrew-first control layout: title, freshness pill and search anchor top-right;
  zoom controls sit top-left
- Vector basemap (OpenFreeMap Bright via MapLibre GL, with Hebrew RTL label
  support) and an automatic OSM raster fallback when WebGL/CDN is unavailable
- Installable as a home-screen app (PWA manifest + icons)
- Auto-refreshes every 2 minutes, paused while the tab/screen is backgrounded
- Free, cookie-free page-view analytics via Cloudflare Web Analytics
- Small "i" info button next to the title for contact info and data-source links

Data source: [Tel Aviv Municipality GIS open data](https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/970),
layer 970 ("חניוני אחוזות החוף"), fetched directly from the browser — no backend.
Per-lot capacity and resident-discount figures are hand-refreshed snapshots
scraped from each lot's ahuzot.co.il page (the GIS feed leaves those mostly empty).
Address search is geocoded by [Photon](https://photon.komoot.io/) (keyless,
OpenStreetMap-based), queried directly from the browser and clipped to the
greater Tel Aviv area.

## Code layout

```
index.html          page shell: meta/PWA tags, DOM skeleton, CDN scripts
css/style.css       all styles
js/main.js          entry point: wires map, chrome, markers, data polling
js/config.js        constants (API URL, refresh cadence, statuses, map defaults)
js/lot-data.js      hand-maintained snapshots (ahuzot.co.il links, discounts, capacities)
js/format.js        pure helpers: Israel wall-clock time math, formatting, distance
js/api.js           GIS feed fetch + parsing
js/map-setup.js     Leaflet map, basemap + raster fallback, view persistence
js/controls.js      banner, brand/info modal, legend, locate button
js/freshness.js     freshness pill + fetch-lifecycle state
js/markers.js       pins, popups, Plan B alternatives, share, #lot= deep links
js/search.js        address search box (Photon geocoding, nearest-lot handoff)
js/report.js        wrong-data report text + Gmail/clipboard helpers
```

## Run locally

A local HTTP server is required (ES modules don't load from `file://`):

```
python3 -m http.server
```

Then open `http://localhost:8000`.
