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

export const STATUS_INFO = {
  "פנוי":  { hex: "#16a34a", label: "פנוי (Available)" },
  "מעט":  { hex: "#d97706", label: "מעט מקומות (Few spaces)" },
  "מלא":  { hex: "#dc2626", label: "מלא (Full)" },
  "סגור": { hex: "#6b7280", label: "סגור (Closed)" },
  "פעיל": { hex: "#64748b", label: "לא ידוע (Status unknown)" }
};
export const DEFAULT_STATUS = STATUS_INFO["פעיל"];
export const STATUS_ORDER = ["פנוי", "מעט", "מלא", "פעיל"];

export const VIEW_STORAGE_KEY = "tlv-parking-map-view";
export const DEFAULT_VIEW = { lat: 32.08, lon: 34.77, zoom: 13 };

// Lot-name labels only render once zoomed in enough that pins have spread
// out -- with ~90 lots, showing them at the full-city zoom would be an
// unreadable overlapping mess.
export const LABEL_MIN_ZOOM = 15;

// How many nearby-alternative rows each popup lists (see planBAlternatives
// in markers.js for the selection rationale).
export const PLANB_COUNT = 3;
