// Talking to the municipality's ArcGIS feed: fetching, timeout, and turning
// its raw attribute rows into the plain lot objects the rest of the app uses.

import { API_URL } from "./config.js";

// Keep the transparency link honest: derive it from the query the app
// actually makes, so an outFields change can't silently desync them.
// Used by both the info modal and the freshness pill's degraded-state link.
export const RAW_API_URL = API_URL.replace("f=json", "f=pjson");

// hearot_taarif is a free-text tariff-notes field; residents' discounts are
// mentioned in it with inconsistent phrasing (e.g. "הנחת תושב בסך 75%
// מתעריף החניון", "75% הנחה לתושבי תל-אביב יפו"). There's no dedicated
// field, so pull the percentage out of any note that mentions a discount.
export function parseResidentDiscountPct(note) {
  if (!note || note.indexOf("הנח") === -1) return null;
  const m = /(\d+)\s*%/.exec(note);
  return m ? parseInt(m[1], 10) : null;
}

export function parseLots(json) {
  if (!json || !Array.isArray(json.features)) return [];
  return json.features.map((f) => {
    const a = f.attributes || {};
    return {
      id: a.oid_hof,
      name: a.shem_chenyon,
      address: a.ktovet,
      lat: typeof a.lat === "number" ? a.lat : parseFloat(a.lat),
      lon: typeof a.lon === "number" ? a.lon : parseFloat(a.lon),
      status: a.status_chenyon,
      updatedAt: a.tr_status_chenyon,
      capacity: a.mispar_mekomot_bchenyon,
      tariffDay: a.taarif_yom,
      tariffNight: a.taarif_layla,
      residentDiscountPct: parseResidentDiscountPct(a.hearot_taarif)
    };
  });
}

// Fetch the feed and return parsed lots; throws on HTTP or API errors.
export async function fetchLots() {
  // Abort stuck requests: without this, one black-holed socket (flaky
  // mobile handoff, captive portal) would leave the fetch pending forever
  // and silently kill every future auto-poll and manual refresh.
  const abort = new AbortController();
  const abortTimer = setTimeout(() => abort.abort(), 25000);
  try {
    const res = await fetch(API_URL, { cache: "no-store", signal: abort.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "API error");
    return parseLots(json);
  } finally {
    clearTimeout(abortTimer);
  }
}
