# חניוני אחוזת החוף תל אביב (Tel Aviv Parking Map)

A single static page showing live parking-lot availability for Tel Aviv's
Ahuzot HaHof coastal parking lots on a map, color-coded by status
(available / few spaces / full / closed). UI is Hebrew-first, with English
in parentheses for the mixed Hebrew/English audience it's built for.

Live: https://chenmu10.github.io/tel-aviv-parking-map/ _(once GitHub Pages is enabled on the repo)_

## Features

- Live availability map with color-coded status pins, filtered to exclude closed lots
- Collapsible legend explaining the status colors
- Each lot's popup shows its address, status, tariffs, capacity, and how long
  ago the data was last updated
- One-tap navigation to a lot via Waze or Google Maps (using its address)
- A link to the lot's official ahuzot.co.il page when one can be matched by name
- "Center map on my location" button
- Installable as a home-screen app (PWA manifest + icons)
- Auto-refreshes every 2 minutes, paused while the tab/screen is backgrounded
- Free, cookie-free page-view analytics via Cloudflare Web Analytics
- Small "i" info button next to the title for contact info

Data source: [Tel Aviv Municipality GIS open data](https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/970),
layer 970 ("חניוני אחוזות החוף"), fetched directly from the browser — no backend.

## Run locally

```
python3 -m http.server
```

Then open `http://localhost:8000`.
