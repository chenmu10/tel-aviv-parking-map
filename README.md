# Tel Aviv Parking Map

A single static page showing live parking-lot availability for Tel Aviv's
Ahuzot HaHof coastal parking lots on a map, color-coded by status
(available / few spaces / full / closed). Lots also show an amber badge
when their data hasn't refreshed in over 30 minutes, flagging it as
possibly stale. A lot's popup also links to its official ahuzot.co.il page
when one can be matched by name.

Live: https://chenmu10.github.io/tel-aviv-parking-map/ _(once GitHub Pages is enabled on the repo)_

Data source: [Tel Aviv Municipality GIS open data](https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/970),
layer 970 ("חניוני אחוזות החוף"), fetched directly from the browser — no backend.

## Run locally

```
python3 -m http.server
```

Then open `http://localhost:8000`.
