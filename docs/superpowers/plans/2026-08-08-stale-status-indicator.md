# Stale Status Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag, per parking lot, when its status hasn't been refreshed recently enough to trust — via a marker badge and popup warning — and fix the existing "Updated" popup timestamp, which is currently displaying a time ~3 hours off from reality.

**Architecture:** Everything lives inline in the existing `<script>` IIFE in `index.html` (no new files, no build step, no backend — matches the project's existing single-page structure). Two small pure functions (`israelNowMs`, `isStale`) compute staleness against a fixed 30-minute threshold; `renderLots()` consumes `isStale()` to conditionally add a badge to the marker pin and a warning line to the popup; `formatUpdatedAt()` is corrected to stop double-applying a timezone offset.

**Tech Stack:** Vanilla JS (ES5-style, matching existing code), Leaflet 1.9.4, `Intl.DateTimeFormat` for timezone-aware time computation. No test framework exists in this project — verification is manual, using Node one-off scripts for pure logic and a locally-served page for visual checks.

## Global Constraints

- Single file only: all changes go into `index.html`. Do not introduce new files, a build step, or a test framework.
- Israel "now" must be computed via a timezone-aware conversion (`Intl.DateTimeFormat` with `timeZone: 'Asia/Jerusalem'`), never a hardcoded `+3h`/`+2h` offset — Israel observes DST.
- `STALE_THRESHOLD_MS` is 30 minutes (`30 * 60 * 1000`).
- The functions being added (`israelNowMs`, `isStale`) and modified (`formatUpdatedAt`, `renderLots`) live inside the existing top-level IIFE (`(function () { ... })();` starting at `index.html:70`) and stay private to it — do not attach them to `window` or otherwise widen the module's public surface; this matches the existing code's encapsulation (no other function in the file is exposed globally either).

---

### Task 1: Timezone-aware staleness check

**Files:**
- Modify: `index.html:77` (insert new constants/functions immediately after the `REFRESH_INTERVAL_MS` declaration, before `STATUS_INFO`)

**Interfaces:**
- Produces: `STALE_THRESHOLD_MS` (number, ms) — used by Task 3.
- Produces: `israelNowMs()` — returns a `number` (ms). Represents "right now" expressed in the same encoding as the API's `tr_status_chenyon` field (Israel local wall-clock time, encoded as if it were UTC epoch ms). Used by `isStale()` in this task and directly testable standalone.
- Produces: `isStale(lot)` — takes a lot object with an `updatedAt` field (`number` ms, same encoding, or falsy), returns `boolean`. Used by Task 3's `renderLots()`.

- [ ] **Step 1: Add the constant and both functions**

Insert directly after line 77 (`var REFRESH_INTERVAL_MS = 2 * 60 * 1000;`), before `var STATUS_INFO = {`:

```js
  var STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  // tr_status_chenyon encodes Israel local wall-clock time as if it were
  // UTC epoch ms (verified against the live API and against ahuzot.co.il's
  // own lot pages). To compare against it, "now" must be computed the same
  // way -- not with Date.now(), which is true UTC and would be off by
  // Israel's UTC offset (which itself changes across DST).
  function israelNowMs() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(new Date());

    var p = {};
    parts.forEach(function (part) { p[part.type] = part.value; });

    // Some environments format midnight as hour "24" under hour12:false.
    var hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);

    return Date.UTC(
      parseInt(p.year, 10),
      parseInt(p.month, 10) - 1,
      parseInt(p.day, 10),
      hour,
      parseInt(p.minute, 10),
      parseInt(p.second, 10)
    );
  }

  function isStale(lot) {
    if (!lot.updatedAt) return false;
    return israelNowMs() - lot.updatedAt > STALE_THRESHOLD_MS;
  }
```

- [ ] **Step 2: Verify `israelNowMs()` tracks real Israel time**

These functions are intentionally private to the page's IIFE (not attached to `window`), matching every other helper in this file — so verify with a standalone Node script rather than the browser console. Create a scratch file (do not commit it) with the exact function bodies from Step 1 plus:

```js
console.log('israelNowMs ->', new Date(israelNowMs()).toISOString());
console.log('real UTC now ->', new Date().toISOString());
```

Run: `node /tmp/verify-israel-now.js` (or any scratch path outside the repo)

Expected: the `israelNowMs` line's date/time-of-day matches Israel's current wall-clock time (check against your system clock's local time if you're in Israel, or any world-clock for Asia/Jerusalem) — e.g. if it's currently 15:32 in Israel, the printed value should read `...T15:32:...Z`, not the true UTC time.

- [ ] **Step 3: Verify `isStale()` boundary behavior**

Append to the same scratch script:

```js
var fresh = { updatedAt: israelNowMs() - 5 * 60 * 1000 };   // 5 min old
var stale = { updatedAt: israelNowMs() - 40 * 60 * 1000 };  // 40 min old
var none  = { updatedAt: null };

console.log('fresh (expect false):', isStale(fresh));
console.log('stale (expect true):', isStale(stale));
console.log('none (expect false):', isStale(none));
```

Run: `node /tmp/verify-israel-now.js`

Expected output: `false`, `true`, `false`. Delete the scratch script once confirmed — it's not part of the codebase.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add timezone-aware staleness check for parking lot data"
```

---

### Task 2: Fix the double-offset "Updated" popup timestamp

**Files:**
- Modify: `index.html:164-167` (`formatUpdatedAt` function body)

**Interfaces:**
- Consumes: nothing new.
- Produces: `formatUpdatedAt(epochMs)` — same signature as before (`number|falsy -> string`), only its output changes. Consumed by `renderLots()` (Task 3, unchanged call site).

**Context:** `tr_status_chenyon` already stores Israel local wall-clock components, mislabeled as UTC ms (see Task 1). The current implementation renders it with the *browser's* local timezone via `toLocaleString()`, which re-applies Israel's UTC+3 offset on top of an already-local value — confirmed live: ahuzot.co.il showed `15:29` for a lot our popup displayed as `18:32:30` (~3h03m gap, matching the double-offset). The fix: format by treating the value's components as UTC, so no further shift is applied.

- [ ] **Step 1: Replace the function body**

Current (`index.html:164-167`):

```js
  function formatUpdatedAt(epochMs) {
    if (!epochMs) return "unknown";
    return new Date(epochMs).toLocaleString();
  }
```

Replace with:

```js
  function formatUpdatedAt(epochMs) {
    if (!epochMs) return "unknown";
    return new Date(epochMs).toLocaleString('en-GB', { timeZone: 'UTC' });
  }
```

- [ ] **Step 2: Verify against the live API and ahuzot.co.il**

Run: `python3 -m http.server 8000` from the repo root, open `http://localhost:8000`.

Click any parking lot marker and note its name and the "Updated: ..." time in the popup. Open `https://www.ahuzot.co.il/Parking/ParkingDetails/?ID=<n>` for the same lot (match by name; try a few IDs if you don't already know the mapping) and compare its listed last-update time.

Expected: the two times now match within a couple of minutes (normal fetch-timing lag), not off by ~3 hours as before.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Fix popup 'Updated' timestamp double-offsetting by ~3 hours"
```

---

### Task 3: Render staleness indicators (marker badge + popup warning)

**Files:**
- Modify: `index.html:47-51` (add a CSS rule for the marker badge near the existing `.pin` rules)
- Modify: `index.html:59` (add a CSS rule for the popup warning line near the existing `.popup-updated` rule)
- Modify: `index.html:177-203` (`renderLots()` — compute staleness per lot, thread it into both the pin HTML and the popup HTML)

**Interfaces:**
- Consumes: `isStale(lot)` from Task 1 (returns `boolean`).
- Produces: no new exports — this is the final consumer of the staleness signal.

- [ ] **Step 1: Add the badge CSS**

Insert after `index.html:51` (right after the `.pin .letter { ... }` block, before the blank line and `.leaflet-popup-content-wrapper` rule):

```css
  .pin .stale-badge {
    position: absolute; top: -2px; right: -4px; width: 16px; height: 16px;
    border-radius: 50%; background: #f59e0b; color: #fff;
    font-size: 10px; line-height: 16px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,.35);
  }
```

- [ ] **Step 2: Add the popup warning CSS**

Insert right after `index.html:59` (`.popup-updated { ... }`):

```css
  .popup-stale { font-size: 11.5px; color: #b45309; margin-top: 4px; font-weight: 600; }
```

- [ ] **Step 3: Update `renderLots()` to compute and use staleness**

Current (`index.html:177-203`):

```js
  function renderLots(lots) {
    markersLayer.clearLayers();
    lots.forEach(function (lot) {
      if (typeof lot.lat !== "number" || typeof lot.lon !== "number") return;
      var info = statusInfo(lot.status);

      var html =
        '<div class="pin"><svg width="30" height="40" viewBox="0 0 30 40">' +
        '<path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="' + info.hex + '"/>' +
        '<circle cx="15" cy="15" r="7" fill="#fff"/></svg>' +
        '<span class="letter" style="color:' + info.hex + '">P</span></div>';
      var icon = L.divIcon({ html: html, className: "", iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] });
      var marker = L.marker([lot.lat, lot.lon], { icon: icon });

      var popupHtml =
        '<div class="popup-title">' + escapeHtml(lot.name || "Parking lot") + "</div>" +
        '<div class="popup-addr">' + escapeHtml(lot.address || "") + "</div>" +
        '<div class="popup-status" style="background:' + info.hex + '1a;color:' + info.hex + '">' + info.label + "</div>" +
        (lot.tariffDay ? '<div class="popup-row">Day: ' + escapeHtml(lot.tariffDay) + "</div>" : "") +
        (lot.tariffNight ? '<div class="popup-row">Night: ' + escapeHtml(lot.tariffNight) + "</div>" : "") +
        (lot.capacity ? '<div class="popup-row">Capacity: ' + escapeHtml(lot.capacity) + "</div>" : "") +
        '<div class="popup-updated">Updated: ' + escapeHtml(formatUpdatedAt(lot.updatedAt)) + "</div>";

      marker.bindPopup(popupHtml);
      markersLayer.addLayer(marker);
    });
  }
```

Replace with:

```js
  function renderLots(lots) {
    markersLayer.clearLayers();
    lots.forEach(function (lot) {
      if (typeof lot.lat !== "number" || typeof lot.lon !== "number") return;
      var info = statusInfo(lot.status);
      var stale = isStale(lot);
      var badgeHtml = stale
        ? '<span class="stale-badge" title="Status may be stale">⏱</span>'
        : '';

      var html =
        '<div class="pin"><svg width="30" height="40" viewBox="0 0 30 40">' +
        '<path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="' + info.hex + '"/>' +
        '<circle cx="15" cy="15" r="7" fill="#fff"/></svg>' +
        '<span class="letter" style="color:' + info.hex + '">P</span>' +
        badgeHtml +
        '</div>';
      var icon = L.divIcon({ html: html, className: "", iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] });
      var marker = L.marker([lot.lat, lot.lon], { icon: icon });

      var popupHtml =
        '<div class="popup-title">' + escapeHtml(lot.name || "Parking lot") + "</div>" +
        '<div class="popup-addr">' + escapeHtml(lot.address || "") + "</div>" +
        '<div class="popup-status" style="background:' + info.hex + '1a;color:' + info.hex + '">' + info.label + "</div>" +
        (lot.tariffDay ? '<div class="popup-row">Day: ' + escapeHtml(lot.tariffDay) + "</div>" : "") +
        (lot.tariffNight ? '<div class="popup-row">Night: ' + escapeHtml(lot.tariffNight) + "</div>" : "") +
        (lot.capacity ? '<div class="popup-row">Capacity: ' + escapeHtml(lot.capacity) + "</div>" : "") +
        '<div class="popup-updated">Updated: ' + escapeHtml(formatUpdatedAt(lot.updatedAt)) + "</div>" +
        (stale ? '<div class="popup-stale">⚠ Hasn\'t updated in over 30 min — may not reflect current availability</div>' : "");

      marker.bindPopup(popupHtml);
      markersLayer.addLayer(marker);
    });
  }
```

- [ ] **Step 4: Verify visually by forcing staleness**

`isStale()` is private to the module and real data is very unlikely to be stale on demand, so force the condition directly: temporarily edit your local `STALE_THRESHOLD_MS` (Task 1) to `0` in `index.html`, save, and reload `http://localhost:8000` (server from Task 2, Step 2 — restart it if you'd stopped it).

Expected: every marker now shows the amber clock badge, and every popup shows the "Hasn't updated in over 30 min..." warning line below the "Updated:" row, styled in amber/bold per the CSS from Steps 1-2.

Then revert `STALE_THRESHOLD_MS` back to `30 * 60 * 1000`, save, and reload once more.

Expected: badges and warning lines disappear again (since real data should be fresh), confirming the threshold — not something left permanently on — controls the behavior.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Show staleness badge and popup warning for outdated parking data"
```

---

## Self-Review Notes

- **Spec coverage:** §1 helper -> Task 1; §2 staleness check -> Task 1; §3 marker badge -> Task 3; §4 popup warning -> Task 3; §5 timestamp display fix -> Task 2. All five spec sections are covered.
- **Placeholders:** none — every step has literal code and literal file line references.
- **Type/name consistency:** `isStale(lot)`, `israelNowMs()`, and `STALE_THRESHOLD_MS` are defined once in Task 1 and referenced identically (same names) in Task 3; `formatUpdatedAt(epochMs)` keeps its existing signature across Task 2 and its Task 3 call site.
