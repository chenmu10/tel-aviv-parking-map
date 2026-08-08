# Official page link in popups — design

## Problem

Each parking lot has an official detail page on ahuzot.co.il
(`/Parking/ParkingDetails/?ID=<n>`), but the map's popups have no way to
reach it. Earlier investigation in this project confirmed:

- The ahuzot.co.il ID and the GIS API's `oid_hof` are unrelated numbering
  schemes (no consistent offset between them).
- `ahuzot-parking-lots.csv` (committed to the repo, 88 rows: `id, name,
  link`) was scraped from `https://www.ahuzot.co.il/Parking/All/` and is
  the only available join point: matching by **name** against the live
  API's `shem_chenyon` field.
- Exact-string name matching resolves 82 of 94 API lots (87%) with zero
  ambiguity. ~6 more are the same lot blocked by minor text differences
  (space/hyphen formatting, and one genuine spelling variant "ברזני" vs
  "ברזאני"). 7 API lots have no CSV counterpart at all (not listed on
  ahuzot.co.il's public page).

## Goal

Add a "View official page" link to each popup, for lots where a match can
be resolved. Do not change what status/data is shown — this is purely an
additive convenience link.

## Design

### 1. `AHUZOT_LINKS` — baked into `index.html`

A JS object mapping a **normalized** lot name to its ahuzot.co.il URL,
generated from `ahuzot-parking-lots.csv` and added as a new constant in
the existing script (alongside `STATUS_INFO`), e.g.:

```js
var AHUZOT_LINKS = {
  "ארלוזורובחנהוסע": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=1",
  "בוגרשוב": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=2",
  /* ...88 entries total, generated from ahuzot-parking-lots.csv... */
};
```

No fetch, no CSV parser, no build step — this is a static table baked in
by hand from the CSV, matching this project's single-file architecture. If
`ahuzot-parking-lots.csv` is ever regenerated, this object needs to be
manually re-baked to match.

### 2. `normalizeLotName(name)` helper

```js
function normalizeLotName(name) {
  return (name || "").replace(/[\s\-()]/g, "");
}
```

Strips whitespace, hyphens, and parentheses. Used both when building
`AHUZOT_LINKS`'s keys (from the CSV's `name` column) and when looking up a
lot at render time (from the live API's `lot.name`, i.e. `shem_chenyon`).

This closes 3 of the 5 known near-miss cases:
- `תל - נורדאו` (API) / `תל-נורדאו` (CSV) — hyphen spacing → now matches
- `קצה השדרה (רוטשילד1)` / `קצה השדרה (רוטשילד 1)` — space before digit → now matches
- `חוף תל-ברוך` / `חוף תל ברוך` — hyphen vs space → now matches

Two known cases remain unmatched by design (light normalization only,
per decision — not worth the complexity of a manual override list for a
hobby project):
- `בית הדר א` (API) / `בית הדר` (CSV) — an actual extra word, not just formatting
- `ברזני` (API) / `ברזאני` (CSV) — a genuine spelling variant, one letter apart

### 3. Popup rendering

In `renderLots()`, look up the link:

```js
var officialLink = AHUZOT_LINKS[normalizeLotName(lot.name)];
```

If found, append one more popup row — an anchor tag opening in a new tab:

```js
(officialLink
  ? '<div class="popup-row"><a href="' + officialLink + '" target="_blank" rel="noopener noreferrer">View official page ↗</a></div>'
  : "")
```

`rel="noopener noreferrer"` is required on `target="_blank"` links as a
security best practice — it prevents the newly opened page from getting a
`window.opener` reference back into this page (reverse tabnabbing).

If no link is found (the ~7-8 unmatched lots), the row is omitted
entirely — those popups look exactly as they do today.

## Non-goals

- Not attempting to resolve the 2 known near-miss cases beyond light
  normalization (spelling variant, extra-word case) — accepted as
  permanently unmatched per the "light normalization" decision.
- Not fetching or parsing the CSV at runtime — it's baked in as static
  data, consistent with this project's no-build-step architecture.
- Not changing `ahuzot-parking-lots.csv` itself, the live GIS API fetch,
  or any existing status/staleness logic.

## Verification

No test framework exists in this project (single `index.html`, no build
step). Verification is manual: reload the page locally and spot-check one
popup from each of the three buckets —
- a clean exact match (link present, correct ID)
- a near-miss now fixed by normalization, e.g. "תל - נורדאו" (link present)
- a true non-match, e.g. "ספיר" (no link row, popup otherwise unchanged)
