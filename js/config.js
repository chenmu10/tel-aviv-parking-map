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

// Greater-Tel-Aviv service area: the box a saved view must fall inside AND
// the box address-search results are clipped to. One constant so the two
// can't drift apart.
export const TLV_BOUNDS = { minLat: 31.9, maxLat: 32.25, minLon: 34.6, maxLon: 34.95 };

// An address search only auto-opens a lot within this distance. The search
// bbox reaches Herzliya/Holon but all lots are in Tel Aviv proper — beyond
// this, opening the "nearest" lot would autopan the map right off the
// searched address.
export const SEARCH_MAX_LOT_DISTANCE_M = 3000;
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

// Resident discounts at or above this show the prominent purple badge/chip;
// smaller ones get the muted style. Used by both the pin badge and the
// popup chip.
export const DISCOUNT_BIG_TIER_PCT = 60;

// Where "this data is wrong" reports go. Ahuzot HaHof (the lot operator and
// the source behind the GIS feed) publishes these on ahuzot.co.il/Contact.
// Their contact form is an ASP.NET POST page that can't be prefilled from a
// link, so the form path copies the report text for pasting.
export const AHUZOT_CONTACT_EMAIL = "ahuzot@ahuzot.co.il";
export const AHUZOT_CONTACT_FORM_URL = "https://www.ahuzot.co.il/Contact/";
