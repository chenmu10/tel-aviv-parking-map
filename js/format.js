// Pure helpers: time math, text formatting and geometry. Nothing here
// touches the DOM, Leaflet or the network.

import { STATUS_INFO, DEFAULT_STATUS, STALE_THRESHOLD_MS } from "./config.js";

export function normalizeLotName(name) {
  return String(name == null ? "" : name).replace(/[\s\-()]/g, "");
}

export function statusInfo(rawStatus) {
  const key = (rawStatus || "").trim();
  return STATUS_INFO[key] || DEFAULT_STATUS;
}

export function formatUpdatedAt(epochMs) {
  if (!epochMs) return "לא ידוע";
  // epochMs's Y/M/D h:m:s components are already Israel wall-clock time,
  // just mislabeled as UTC ms by the source API.
  // Formatting with timeZone: 'UTC' reads those components back out as-is;
  // do NOT switch this to plain toLocaleString() -- that would re-apply the
  // browser's local offset on top and reintroduce the ~3 hour display bug.
  return new Date(epochMs).toLocaleString("en-GB", { timeZone: "UTC" });
}

// Intl.DateTimeFormat construction is expensive; build once and reuse.
let israelClockFormatter = null;

// tr_status_chenyon encodes Israel local wall-clock time as if it were
// UTC epoch ms (verified against the live API and against ahuzot.co.il's
// own lot pages). To diff against it, "now" must be computed the same
// way -- not with Date.now(), which is true UTC and would be off by
// Israel's UTC offset (which itself changes across DST).
export function israelNowMs() {
  if (!israelClockFormatter) {
    israelClockFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    });
  }
  const p = {};
  israelClockFormatter.formatToParts(new Date()).forEach((part) => { p[part.type] = part.value; });

  // Some environments format midnight as hour "24" under hour12:false.
  const hour = p.hour === "24" ? 0 : parseInt(p.hour, 10);

  return Date.UTC(
    parseInt(p.year, 10),
    parseInt(p.month, 10) - 1,
    parseInt(p.day, 10),
    hour,
    parseInt(p.minute, 10),
    parseInt(p.second, 10)
  );
}

export function formatAgo(epochMs, nowMs) {
  if (!epochMs) return "";
  const minutes = Math.floor(Math.max(0, nowMs - epochMs) / 60000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return "לפני " + minutes + " דקות";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return "לפני " + hours + " שעות";
  const days = Math.floor(hours / 24);
  return "לפני " + days + " ימים";
}

export function isLotStale(lot, nowMs) {
  return !lot.updatedAt || (nowMs - lot.updatedAt) > STALE_THRESHOLD_MS;
}

export function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(m) {
  return m < 1000 ? Math.round(m / 10) * 10 + " מ׳" : (m / 1000).toFixed(1) + " ק״מ";
}
