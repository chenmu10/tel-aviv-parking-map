# Stale status indicator — design

## Problem

The map is a pure client-side display of the Tel Aviv Municipality's public
GIS API (layer 970, `status_chenyon`). It has no backend and does no
validation — it renders whatever status the municipality's system reports.

A user visited a lot shown as "מלא" (Full) and found many open spaces in
person. The likely cause is upstream: the municipality's sensor/system
stopped updating that lot's status, and our map has no way to signal "this
status might be stale" — it just shows the last value it received as if it
were current.

## Goal

Surface, per lot, when a status hasn't been refreshed recently enough to
trust — without changing what status is displayed. This is a data-quality
signal layered on top of the existing display, not a correction of the
underlying data (which we don't control).

## Key finding: timestamp format quirk

`tr_status_chenyon` (the field we map to `lot.updatedAt`) is **not** a
normal UTC epoch timestamp. Spot-checking the live API: at 12:29 UTC, a
freshly-updated lot reported `tr_status_chenyon: 1786202550557`, which
decodes (as UTC ms) to `2026-08-08 15:22:30` — exactly the Israel local
wall-clock time (UTC+3, IDT), not the true UTC instant.

In other words: the field is Israel local time, mis-encoded as if it were
milliseconds-since-epoch UTC. Naively computing
`Date.now() - lot.updatedAt` would make every timestamp look ~3 hours in
the future, and silently break any staleness threshold (a lot that's 40
minutes stale would compute as `-2h20m` old, never crossing a 30-minute
threshold).

Since Israel observes DST, a hardcoded `+3h` correction would also quietly
break for an hour twice a year. The fix is to compute "Israel's current
wall-clock time" directly via a timezone-aware conversion, so it's always
expressed in the same (mislabeled) representation as the source data.

## Design

### 1. `israelNowMs()` helper

Uses `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', ... })` to
read the current date/time components as they are *right now in Israel*,
then reconstructs them with `Date.UTC(year, month, day, hour, minute,
second)`. The result is a ms value in the same "local time labeled as UTC"
representation as `tr_status_chenyon`, so it can be diffed directly against
it regardless of the visitor's own browser timezone.

### 2. Staleness check

```
STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function isStale(lot) {
  if (!lot.updatedAt) return false; // no timestamp -> no claim either way
  return israelNowMs() - lot.updatedAt > STALE_THRESHOLD_MS;
}
```

Recomputed every time `renderLots()` runs — on initial load, on the
existing 2-minute auto-refresh (`REFRESH_INTERVAL_MS`), and on manual
"Refresh now". No separate timer is needed; 30-minute-threshold staleness
doesn't need finer-grained ticking than the existing refresh cadence.

### 3. Marker treatment

Pin color keeps its current meaning (what the municipality reported).
Staleness is an orthogonal signal: when `isStale(lot)` is true, overlay a
small amber badge (clock icon) at the top-right corner of the pin's SVG.
This keeps "reported full" visually distinct from "reported full, but
that report is old and might not reflect reality."

### 4. Popup treatment

When stale, add a line below the existing "Updated: ..." row:

> ⚠ Hasn't updated in over 30 min — may not reflect current availability

Non-stale lots are unaffected; the popup looks exactly as it does today.

## Non-goals

- Not cross-referencing another data source.
- Not letting users submit corrections/reports (bigger feature, needs a
  backend; out of scope for this pass).
- Not correcting or filtering the underlying status value — we only ever
  add a "this might be old" signal, never suppress or override what the
  municipality reported.

## Verification

No test framework exists in this static-page project (single `index.html`,
no build step). Verification is manual:

1. In the browser console, call `isStale({ updatedAt: <fabricated old ms> })`
   and `isStale({ updatedAt: <fabricated fresh ms> })` and confirm the
   booleans are correct.
2. With the page loaded, temporarily patch one entry of the in-memory lots
   data via the console to an old `updatedAt` and re-render, confirming the
   badge appears on that marker and the popup shows the warning line.
   Revert by reloading the page — no debug code is left in `index.html`.
