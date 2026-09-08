// Shared constants. Plain values only — no imports, no DOM, no Leaflet —
// so every other module can import from here without ordering concerns.

export const API_URL = "https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/970/query" +
  "?where=1%3D1" +
  "&outFields=oid_hof,shem_chenyon,ktovet,lon,lat,status_chenyon,tr_status_chenyon,mispar_mekomot_bchenyon,taarif_yom,taarif_layla,hearot_taarif" +
  "&returnGeometry=false" +
  "&f=json";

export const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

// The GIS feed's per-lot status timestamp (tr_status_chenyon) can lag far
// behind reality; past this age a lot's status is shown but visibly
// demoted (faded pin + warning) instead of looking confidently live.
export const STALE_THRESHOLD_MS = 30 * 60 * 1000;

// label is the long bilingual form (legend); short is the one-word Hebrew
// form for the compact status pill in the popup header.
export const STATUS_INFO = {
  "פנוי":  { hex: "#16a34a", label: "פנוי (Available)", short: "פנוי" },
  "מעט":  { hex: "#d97706", label: "מעט מקומות (Few spaces)", short: "מעט" },
  "מלא":  { hex: "#dc2626", label: "מלא (Full)", short: "מלא" },
  "סגור": { hex: "#6b7280", label: "סגור (Closed)", short: "סגור" },
  "פעיל": { hex: "#64748b", label: "לא ידוע (Status unknown)", short: "לא ידוע" }
};
export const DEFAULT_STATUS = STATUS_INFO["פעיל"];
export const STATUS_ORDER = ["פנוי", "מעט", "מלא", "פעיל"];

export const VIEW_STORAGE_KEY = "tlv-parking-map-view";
export const DEFAULT_VIEW = { lat: 32.08, lon: 34.77, zoom: 13 };
// Saved views older than this are ignored: view persistence exists for the
// minutes-scale Waze-hop tab eviction (see map-setup.js), not for opening
// the map days later zoomed into wherever you last parked.
export const VIEW_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Lot-name labels only render once zoomed in enough that pins have spread
// out -- with ~90 lots, showing them at the full-city zoom would be an
// unreadable overlapping mess.
export const LABEL_MIN_ZOOM = 15;

// How many nearby-alternative rows each popup lists (see planBAlternatives
// in markers.js for the selection rationale).
export const PLANB_COUNT = 3;
