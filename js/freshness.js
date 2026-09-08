// The freshness pill and the fetch-lifecycle state it displays.
// Shows when THIS page last pulled the API (client-side clock, unrelated
// to the feed's per-lot Israel-wall-clock timestamps) and doubles as a
// manual refresh button — proof the map isn't frozen.
//
// main.js drives it through beginFetch / recordFetchSuccess /
// recordFetchError / endFetch; this module never imports main.js.

import { STALE_THRESHOLD_MS } from "./config.js";
import { israelNowMs } from "./format.js";
import { RAW_API_URL } from "./api.js";

let freshnessPill = null;
let freshnessText = null;
// Newest tr_status_chenyon across all lots. The feed writes every lot in
// one batch sweep (verified: all timestamps within ~240ms of each other),
// so this single value IS the data's age -- shown in the pill instead of
// per-pin indicators, which would all read the same number.
let sourceUpdatedAt = null;
let fetchInFlight = false;
// The feed sometimes serves rows with null status/timestamp on every lot
// (observed live during an early-morning window). Distinguishes that from
// "first fetch hasn't finished", so the pill doesn't claim to be loading
// forever.
let hasLoadedOnce = false;

function updateFreshnessPill() {
  if (!freshnessText) return;
  // Don't overwrite the transient "✓ updated" flash (cleared by its timer).
  if (freshnessPill && freshnessPill.classList.contains("success")) return;
  if (fetchInFlight) {
    freshnessText.textContent = "מעדכן נתונים מאתר אחוזות החוף… (Refreshing)";
    return;
  }
  if (!sourceUpdatedAt) {
    if (hasLoadedOnce) {
      freshnessText.textContent = "אין כרגע נתוני זמינות באתר אחוזות החוף (Source data unavailable)";
      freshnessPill.classList.add("aged");
    } else {
      freshnessText.textContent = "טוען… (Loading)";
    }
    return;
  }
  // Source timestamps are Israel wall clock (see israelNowMs), so the age
  // must be diffed against the same clock, never Date.now().
  // Coarse buckets on purpose: a per-second countdown draws the eye to
  // chrome instead of the map and implies precision the data doesn't have.
  const seconds = Math.max(0, Math.round((israelNowMs() - sourceUpdatedAt) / 1000));
  const ago = seconds < 60
    ? "לפני פחות מדקה"
    : seconds < 3600
      ? "לפני " + Math.floor(seconds / 60) + " דק׳"
      : "לפני " + Math.floor(seconds / 3600) + " שע׳";
  freshnessText.textContent = "עדכון אחרון באתר אחוזות החוף: " + ago;
  freshnessPill.classList.toggle("aged", seconds * 1000 > STALE_THRESHOLD_MS);
}
// 60s matches the label's coarsest visible step (minutes).
setInterval(updateFreshnessPill, 60000);

// isManual: triggered by the pill's refresh button. A tap needs visible
// confirmation even when no pin changed (otherwise "did it work?"), so
// manual refreshes flash a success state; the 2-minute auto-poll stays
// silent to avoid constant chrome noise.
// A manual check usually finds NO new data (the site updates on its own
// schedule), so the flash must say "checked, nothing new" rather than
// "updated" -- otherwise the unchanged age below reads as a broken button.
let successFlashTimer = null;
function flashRefreshSuccess(hasNewData) {
  if (!freshnessPill) return;
  clearTimeout(successFlashTimer);
  freshnessPill.classList.add("success");
  freshnessText.textContent = hasNewData
    ? "✓ התקבלו נתונים חדשים (New data)"
    : "✓ נבדק עכשיו — אין עדכון חדש באתר (No new data)";
  successFlashTimer = setTimeout(() => {
    freshnessPill.classList.remove("success");
    updateFreshnessPill();
  }, 2600);
}

// Marks a fetch as started; returns false (and does nothing) if one is
// already in flight, so callers can simply bail.
export function beginFetch() {
  if (fetchInFlight) return false;
  fetchInFlight = true;
  if (freshnessPill) freshnessPill.classList.add("loading");
  updateFreshnessPill();
  return true;
}

export function endFetch() {
  fetchInFlight = false;
  if (freshnessPill) freshnessPill.classList.remove("loading");
  updateFreshnessPill();
}

export function recordFetchSuccess(lots, isManual) {
  const prevSourceUpdatedAt = sourceUpdatedAt;
  sourceUpdatedAt = lots.reduce((max, l) => {
    return l.updatedAt && l.updatedAt > max ? l.updatedAt : max;
  }, 0) || null;
  hasLoadedOnce = true;
  if (freshnessPill) freshnessPill.classList.remove("error");
  // "New data" only when a real timestamp advanced -- a transition to
  // all-null (outage start) is a change, but not good news.
  if (isManual) flashRefreshSuccess(!!sourceUpdatedAt && sourceUpdatedAt !== prevSourceUpdatedAt);
}

export function recordFetchError() {
  if (freshnessPill) freshnessPill.classList.add("error");
}

// onRefresh: called when the user taps the pill (wired by main.js to a
// manual data load).
export function initFreshnessPill(map, onRefresh) {
  const FreshnessControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      const div = L.DomUtil.create("div", "freshness-pill");
      div.title = "בדוק עכשיו אם יש עדכון (Check now for updates)";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "refresh-btn";
      btn.setAttribute("aria-label", "בדוק עכשיו אם יש עדכון (Check now for updates)");
      const icon = document.createElement("span");
      icon.className = "refresh-icon";
      icon.textContent = "↻";
      btn.appendChild(icon);
      div.appendChild(btn);

      const text = document.createElement("span");
      div.appendChild(text);

      // Direct escape hatch when something looks wrong (outage / stale /
      // fetch error): lets users verify against the source without hunting
      // for the info modal. Hidden while everything is healthy (CSS).
      const rawLink = document.createElement("a");
      rawLink.className = "raw-link";
      rawLink.href = RAW_API_URL;
      rawLink.target = "_blank";
      rawLink.rel = "noopener noreferrer";
      rawLink.textContent = "לנתוני המקור ↗";
      rawLink.title = "צפייה בנתונים הגולמיים מהעירייה (View raw source data)";
      L.DomEvent.on(rawLink, "click", (e) => {
        L.DomEvent.stopPropagation(e);
      });
      div.appendChild(rawLink);

      L.DomEvent.on(div, "click", (e) => {
        L.DomEvent.stopPropagation(e);
        onRefresh();
      });
      L.DomEvent.disableClickPropagation(div);

      freshnessPill = div;
      freshnessText = text;
      updateFreshnessPill();
      return div;
    }
  });
  new FreshnessControl().addTo(map);
}
