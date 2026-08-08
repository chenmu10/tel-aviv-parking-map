# Official Page Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "View official page" link to each parking lot's popup, pointing to its ahuzot.co.il detail page, resolved by matching the live API's lot name against `ahuzot-parking-lots.csv` (name-based, since the two systems' IDs are unrelated).

**Architecture:** A static lookup table (`AHUZOT_LINKS`, normalized name → URL) is baked into the existing `<script>` IIFE in `index.html`, generated once from `ahuzot-parking-lots.csv`. `renderLots()` looks up each lot by its normalized name and appends a link row to the popup when found.

**Tech Stack:** Vanilla JS (matching existing code style), no build step, no fetch/parse of the CSV at runtime — the CSV is a one-time data source for hand-generating the JS object.

## Global Constraints

- Single file only: all code changes go into `index.html`. `ahuzot-parking-lots.csv` is not read at runtime — it was already scraped and committed; this plan only consumes its *contents* (already extracted below) to hand-write a JS object.
- Normalization is `name.replace(/[\s\-()]/g, "")` — strips whitespace, hyphens, and parentheses. No further fuzzy matching (spelling variants stay unmatched, by design).
- Links open with `target="_blank" rel="noopener noreferrer"` — required security pairing for external links opened in a new tab.
- Lots with no resolvable link get no popup row at all (not a disabled placeholder).

---

### Task 1: `AHUZOT_LINKS` lookup table and `normalizeLotName` helper

**Files:**
- Modify: `index.html:131` (insert immediately after the `STATUS_ORDER` declaration, before the blank line and `function statusInfo`)

**Interfaces:**
- Produces: `normalizeLotName(name)` — `string|falsy -> string`. Strips whitespace, hyphens, parentheses.
- Produces: `AHUZOT_LINKS` — a plain object mapping `normalizeLotName(csvName) -> url string`, covering all 88 rows of `ahuzot-parking-lots.csv`. Consumed by Task 2.

- [ ] **Step 1: Add the helper and the lookup table**

Insert directly after line 131 (`var STATUS_ORDER = ["פנוי", "מעט", "מלא", "פעיל"];`), before the blank line and `function statusInfo`:

```js

  function normalizeLotName(name) {
    return (name || "").replace(/[\s\-()]/g, "");
  }

  // Generated from ahuzot-parking-lots.csv (id/name/link scraped from
  // https://www.ahuzot.co.il/Parking/All/). Keys are normalizeLotName()
  // applied to the CSV's name column; re-generate this whole block by
  // hand if that CSV is ever regenerated.
  var AHUZOT_LINKS = {
    "ארלוזורובחנהוסע": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=1",
    "בוגרשוב": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=2",
    "בזל": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=3",
    "חברהחדשה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=4",
    "בנידן": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=7",
    "ברוריה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=8",
    "גולדה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=10",
    "גליגיל": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=12",
    "גןהכובשים1מזרח": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=13",
    "דובנוב": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=15",
    "הארד": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=16",
    "החשמל": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=18",
    "הצפירה1": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=19",
    "הצפירה2": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=20",
    "ביתהאצ\"ל": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=21",
    "פנחסרוזן": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=23",
    "כרמל1": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=24",
    "הלוחמים": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=25",
    "לולאה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=26",
    "התחנה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=28",
    "מונטיפיורי": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=29",
    "מפעלהפיס": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=31",
    "מרכזים": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=32",
    "מרד": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=33",
    "נחושת": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=34",
    "סינרמה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=37",
    "סעדיהגאון": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=38",
    "פלמ\"ח": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=39",
    "רבניצקי": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=40",
    "רידינגמערב": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=41",
    "שרתון": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=42",
    "התקומה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=44",
    "תלנורדאו": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=45",
    "מירשם": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=48",
    "מדעיהחברה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=50",
    "רפואתשיניים": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=53",
    "גליצה\"ל": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=54",
    "הבעש\"ט": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=55",
    "אבולעפיה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=56",
    "הרבקוק": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=57",
    "ידאבנר": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=58",
    "מיומי": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=62",
    "מכללהלמינהלומכללתלוינסקי1": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=63",
    "אחימאיר": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=64",
    "סלודור": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=65",
    "צבינישרי": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=67",
    "רפידים": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=68",
    "שלונסקי": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=69",
    "מבצעקדש": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=70",
    "ביתהחייל": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=72",
    "פליטיהספר": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=75",
    "טירתצבי": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=76",
    "המערכה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=77",
    "טאגור": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=79",
    "מכללתיפו": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=80",
    "עירשמש": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=81",
    "ביתצורי": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=85",
    "ברזאני": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=87",
    "בןיוסף2": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=88",
    "וולפסון2": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=89",
    "מכללהלמינהלומכללתלוינסקי3": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=90",
    "מכללהלמינהלומכללתלוינסקי2": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=91",
    "ביתהדר": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=93",
    "התרבות": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=94",
    "סמולרש": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=95",
    "כלכלה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=96",
    "גולפיטק": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=98",
    "גנייהושע": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=99",
    "סוציאליתמעונות": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=108",
    "אלוף": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=110",
    "כרמל2": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=114",
    "לסקוב": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=119",
    "ליבר": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=120",
    "המוזיאונים": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=121",
    "אסותא": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=122",
    "ארלוזורוב17": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=123",
    "גולדמן": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=124",
    "רידינגמזרח": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=126",
    "צמרות": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=127",
    "גןהכובשים2מערב": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=129",
    "רמזארלוזורוב": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=131",
    "כיכרעליה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=132",
    "המשתלה": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=133",
    "חוףתלברוך": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=134",
    "קצההשדרהרוטשילד1": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=135",
    "כיתן": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=137",
    "בןיוסף": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=138",
    "סוללים": "https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=140"
  };
```

- [ ] **Step 2: Verify the table and normalization with a Node scratch script**

These are pure functions with no DOM/Leaflet dependency, so verify with a standalone Node script (do not commit it — matches this project's existing verification pattern for pure helpers). Extract the `normalizeLotName` function and `AHUZOT_LINKS` object literal exactly as inserted, plus:

```js
var tests = [
  ['תל - נורדאו', 'https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=45'],   // near-miss, should now match
  ['קצה השדרה (רוטשילד1)', 'https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=135'], // exact, has parens+digit
  ['חוף תל-ברוך', 'https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=134'], // near-miss, should now match
  ['ספיר', undefined],       // true non-match, no CSV entry
  ['בית הדר א', undefined],  // known-unmatched: extra word, not just formatting
  ['ברזני', undefined],      // known-unmatched: spelling variant
  ['בית האצ"ל', 'https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=21'] // gershayim character in the name
];
tests.forEach(function (t) {
  var got = AHUZOT_LINKS[normalizeLotName(t[0])];
  console.log(t[0], '->', got, got === t[1] ? 'OK' : 'MISMATCH (expected ' + t[1] + ')');
});
console.log('total entries:', Object.keys(AHUZOT_LINKS).length, '(expect 88)');
```

Run: `node /tmp/verify-ahuzot-links.js` (or any scratch path outside the repo)

Expected: all 7 lines print `OK`, and the total is `88`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add AHUZOT_LINKS lookup table and normalizeLotName helper"
```

---

### Task 2: Render the official-page link in each popup

**Files:**
- Modify: `index.html:264-265` (`popupHtml` construction inside `renderLots()`)

**Interfaces:**
- Consumes: `AHUZOT_LINKS` and `normalizeLotName(name)` from Task 1.
- Produces: no new exports — this is the final consumer of the lookup table.

- [ ] **Step 1: Add the link lookup and popup row**

Current (`index.html:257-265`):

```js
      var popupHtml =
        '<div class="popup-title">' + escapeHtml(lot.name || "Parking lot") + "</div>" +
        '<div class="popup-addr">' + escapeHtml(lot.address || "") + "</div>" +
        '<div class="popup-status" style="background:' + info.hex + '1a;color:' + info.hex + '">' + info.label + "</div>" +
        (lot.tariffDay ? '<div class="popup-row">Day: ' + escapeHtml(lot.tariffDay) + "</div>" : "") +
        (lot.tariffNight ? '<div class="popup-row">Night: ' + escapeHtml(lot.tariffNight) + "</div>" : "") +
        (lot.capacity ? '<div class="popup-row">Capacity: ' + escapeHtml(lot.capacity) + "</div>" : "") +
        '<div class="popup-updated">Updated: ' + escapeHtml(formatUpdatedAt(lot.updatedAt)) + "</div>" +
        (stale ? '<div class="popup-stale">⚠ Hasn\'t updated in over 30 min — may not reflect current availability</div>' : "");
```

Replace with:

```js
      var officialLink = AHUZOT_LINKS[normalizeLotName(lot.name)];

      var popupHtml =
        '<div class="popup-title">' + escapeHtml(lot.name || "Parking lot") + "</div>" +
        '<div class="popup-addr">' + escapeHtml(lot.address || "") + "</div>" +
        '<div class="popup-status" style="background:' + info.hex + '1a;color:' + info.hex + '">' + info.label + "</div>" +
        (lot.tariffDay ? '<div class="popup-row">Day: ' + escapeHtml(lot.tariffDay) + "</div>" : "") +
        (lot.tariffNight ? '<div class="popup-row">Night: ' + escapeHtml(lot.tariffNight) + "</div>" : "") +
        (lot.capacity ? '<div class="popup-row">Capacity: ' + escapeHtml(lot.capacity) + "</div>" : "") +
        '<div class="popup-updated">Updated: ' + escapeHtml(formatUpdatedAt(lot.updatedAt)) + "</div>" +
        (stale ? '<div class="popup-stale">⚠ Hasn\'t updated in over 30 min — may not reflect current availability</div>' : "") +
        (officialLink ? '<div class="popup-row"><a href="' + officialLink + '" target="_blank" rel="noopener noreferrer">View official page ↗</a></div>' : "");
```

Note: `officialLink` comes from our own baked-in `AHUZOT_LINKS` table (trusted, static, generated by us), not from the live API response, so it is not passed through `escapeHtml()` — consistent with treating it as trusted static data rather than untrusted API/user input.

- [ ] **Step 2: Verify visually**

Serve the page locally (`python3 -m http.server 8000` from the repo root) and open `http://localhost:8000`. Click markers and confirm, using the same three example lots from Task 1's verification:

- A clean match (e.g. "בית האצ\"ל" / "התחנה" / any lot not in the known-gap list): popup shows a "View official page ↗" row; clicking it opens the correct `ParkingDetails/?ID=<n>` page in a new tab.
- A near-miss now fixed by normalization (e.g. "תל - נורדאו"): link row present, opens `ID=45`.
- A true non-match (e.g. "ספיר"): no link row present; popup otherwise unchanged from before this feature.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Show official ahuzot.co.il page link in popup when a match is found"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (`AHUZOT_LINKS` baked in) -> Task 1; §2 (`normalizeLotName`, near-miss handling) -> Task 1; §3 (popup rendering, omit-if-unmatched) -> Task 2. All spec sections covered.
- **Placeholders:** none — the full 88-entry table is written out verbatim (hand-generated and validated with `node -e` against the actual `ahuzot-parking-lots.csv` before this plan was written; entries checked to be free of key collisions after normalization).
- **Type/name consistency:** `AHUZOT_LINKS` and `normalizeLotName` are defined once in Task 1 and referenced identically by name in Task 2; `officialLink` is a new local variable scoped to the existing `forEach` callback in `renderLots()`, not reused elsewhere.
- **Escaping note carried into Task 2:** double-quote characters inside Hebrew names (gershayim, e.g. `האצ"ל`) are escaped as `\"` in the `AHUZOT_LINKS` keys in Task 1 — verified this parses correctly and round-trips via Step 2's Node check before finalizing this plan.
