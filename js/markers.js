// Lot markers and their popups: re-rendered on every data refresh, plus
// everything popups carry — Plan B nearby alternatives, the share button,
// #lot= deep links, and keeping an open popup alive across re-renders.
// Plan B lives here (not its own module) because it and the popup HTML and
// markersByLotId all need each other; splitting them would only create an
// import cycle.

import { PLANB_COUNT, DISCOUNT_BIG_TIER_PCT, SEARCH_MAX_LOT_DISTANCE_M } from "./config.js";
import {
  AHUZOT_LINK_BASE, AHUZOT_LINKS,
  RESIDENT_DISCOUNT_BY_AHUZOT_ID, CAPACITY_BY_AHUZOT_ID
} from "./lot-data.js";
import {
  normalizeLotName, statusInfo, formatUpdatedAt, israelNowMs, formatAgo,
  isLotStale, escapeHtml, distanceMeters, formatDistance, bearingDegrees
} from "./format.js";

const SVG_NS = "http://www.w3.org/2000/svg";

let map = null;
let markersLayer = null;

// The #lot=<oid> from the URL, if any. Consumed once, on the first render
// that has the lot's marker (see renderLots).
let pendingDeepLinkLotId = null;

// lot id -> its current marker, so Plan B rows can open another lot's
// popup. Rebuilt on every render (markers are recreated each refresh).
let markersByLotId = {};

// Which lot's popup is currently open (null if none) -- lets a re-render
// restore the popup it necessarily closes when rebuilding markers.
let openPopupLotId = null;

// The lots from the most recent render, for lookups that start outside the
// render loop (the address search's nearest-lot query).
let lastVisibleLots = [];

// Keeps popups clear of the fixed corner controls when Leaflet auto-pans
// them into view -- without this, a popup near the top can end up under
// the zoom control, and one near the bottom under the legend.
// Measured from the real control corners, not fixed numbers: on narrow
// phones the brand + pill + search stack wraps and grows well past the
// 90px the old constant assumed, which parked popups underneath the pill.
// Top clearance takes the taller of the two top corners (the brand stack
// sits top-right for RTL, zoom top-left).
function popupAutopanPadding() {
  const topLeft = document.querySelector(".leaflet-top.leaflet-left");
  const topRight = document.querySelector(".leaflet-top.leaflet-right");
  const bottomRight = document.querySelector(".leaflet-bottom.leaflet-right");
  const topHeight = Math.max(topLeft ? topLeft.offsetHeight : 0, topRight ? topRight.offsetHeight : 0, 80);
  return {
    autoPanPaddingTopLeft: L.point(16, topHeight + 12),
    autoPanPaddingBottomRight: L.point(190, Math.max(160, (bottomRight ? bottomRight.offsetHeight : 150) + 12))
  };
}

// --- Plan B: nearby alternatives ---------------------------------------------

// Plan B: the nearest not-full lots, so a driver who arrives at a lot the
// feed got wrong already has somewhere to go next. Prefers lots the feed
// says have room (פנוי/מעט); pads with status-unknown lots only when
// fewer than PLANB_COUNT of those exist nearby.
function planBAlternatives(lot, visibleLots, nowMs) {
  const withRoom = [];
  const unknown = [];
  visibleLots.forEach((other) => {
    if (other === lot) return;
    const st = (other.status || "").trim();
    if (st === "מלא") return;
    const entry = {
      lot: other,
      dist: distanceMeters(lot.lat, lot.lon, other.lat, other.lon),
      isStale: isLotStale(other, nowMs)
    };
    (st === "פנוי" || st === "מעט" ? withRoom : unknown).push(entry);
  });
  // Fresh statuses outrank stale ones: a stale "available" is a weaker
  // promise than a fresh one, whatever the distance.
  const byFreshThenDist = (a, b) => {
    if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
    return a.dist - b.dist;
  };
  withRoom.sort(byFreshThenDist);
  unknown.sort(byFreshThenDist);
  return withRoom.slice(0, PLANB_COUNT)
    .concat(unknown.slice(0, Math.max(0, PLANB_COUNT - withRoom.length)));
}

// Rows deliberately open the alternative's own popup (via the delegated
// click handler in initMarkers) rather than deep-linking straight into
// Waze: the user should see that lot's update time and stale warning
// before committing to drive there.
function planBHtml(lot, visibleLots, nowMs) {
  const alts = planBAlternatives(lot, visibleLots, nowMs);
  if (!alts.length) return "";
  const rows = alts.map((alt) => {
    const altInfo = statusInfo(alt.lot.status);
    return `<div class="popup-planb-row${alt.isStale ? " stale" : ""}" data-lot-id="${escapeHtml(alt.lot.id)}">` +
      `<span class="dot" style="background:${altInfo.hex}"></span>` +
      (alt.isStale ? '<span class="planb-stale">⚠️</span>' : "") +
      `<span class="planb-name">${escapeHtml(alt.lot.name || "חניון")}</span>` +
      // North-up arrow rotated to the real-world bearing, so the row also
      // says which way the alternative is (map is always north-up).
      // Computed here, after the top-3 slice -- doing it per candidate pair
      // in planBAlternatives would be ~8k wasted atan2 calls per render.
      `<span class="planb-arrow" style="transform:rotate(${Math.round(bearingDegrees(lot.lat, lot.lon, alt.lot.lat, alt.lot.lon))}deg)" aria-hidden="true">↑</span>` +
      `<span class="planb-dist">${formatDistance(alt.dist)}</span>` +
      "</div>";
  }).join("");
  return '<div class="popup-planb">' +
    '<div class="popup-planb-title">חניונים קרובים (Nearby lots)</div>' +
    rows + "</div>";
}

// --- Share button -------------------------------------------------------------

function createShareIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  [[18, 5], [6, 12], [18, 19]].forEach((c) => {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", c[0]);
    circle.setAttribute("cy", c[1]);
    circle.setAttribute("r", "3");
    svg.appendChild(circle);
  });
  [[8.6, 10.7, 15.4, 6.3], [8.6, 13.3, 15.4, 17.7]].forEach((p) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", p[0]);
    line.setAttribute("y1", p[1]);
    line.setAttribute("x2", p[2]);
    line.setAttribute("y2", p[3]);
    svg.appendChild(line);
  });
  return svg;
}

// Single source of truth for the share glyph: the popup HTML string is
// derived from the same DOM builder used to restore the icon after the
// "copied" flash, so the two can't drift apart.
const SHARE_SVG = createShareIcon().outerHTML;

// navigator.share opens the native sheet (the mobile case this is for);
// desktop browsers without it copy the link and flash confirmation.
function onShareClick(e) {
  const btn = e.target.closest && e.target.closest(".popup-share");
  if (!btn) return;
  const url = location.origin + location.pathname + "#lot=" + btn.getAttribute("data-lot-id");
  const name = btn.getAttribute("data-lot-name");
  // The text carries a Google Maps destination link so nav-oriented share
  // targets (e.g. the Tesla app, which sends destinations to the car and
  // can't parse our deep link) get usable coordinates; human recipients
  // still get the map deep link in the url field.
  // The link goes FIRST: such targets geocode the first place-like thing
  // they find in the text, and a leading lot name like "כרמל 1" (generic)
  // or "בית האצ\"ל" (gershayim breaks address parsing) resolved to the city
  // center instead of the lot, while unique names like "ליבר" happened to
  // work. Coordinates first, name on its own line after.
  const navUrl = "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(btn.getAttribute("data-latlon"));
  if (navigator.share) {
    navigator.share({ title: "חניון " + name, text: navUrl + "\nחניון " + name, url: url }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      // Compact ✓ flash: the button keeps its fixed size so the flash
      // can't overflow the popup-nav row.
      btn.classList.add("copied");
      btn.textContent = "✓";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.textContent = "";
        btn.appendChild(createShareIcon());
      }, 1600);
    }).catch(() => {
      // Clipboard can reject (unfocused document, permissions policy);
      // fall back to letting the user copy manually.
      window.prompt("העתק את הקישור (Copy the link):", url);
    });
  } else {
    window.prompt("העתק את הקישור (Copy the link):", url);
  }
}

function onPlanBClick(e) {
  const row = e.target.closest && e.target.closest(".popup-planb-row");
  if (!row) return;
  const marker = markersByLotId[row.getAttribute("data-lot-id")];
  if (marker) marker.openPopup();
}

// --- Rendering ----------------------------------------------------------------

function pinHtml(info, discountBadge) {
  return '<div class="pin"><svg width="30" height="40" viewBox="0 0 30 40">' +
    `<path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${info.hex}"/>` +
    '<circle cx="15" cy="15" r="7" fill="#fff"/></svg>' +
    `<span class="letter" style="color:${info.hex}">P</span>` +
    discountBadge +
    "</div>";
}

// "Action-first" layout: name + compact status pill, one meta line, big
// Waze/Maps buttons, key facts as chips, then everything long (full
// timestamp, tariff free text, official link) folded into a native
// <details> expander so the tariff wall no longer dominates the popup.
function popupHtml(lot, info, isStale, nowMs, visibleLots, officialLink, capacity, discountPct) {
  // Always navigate by lat/lon, not the lot's street address: addresses
  // like "הנמל 1" are ambiguous (e.g. Tel Aviv Port vs. Jaffa Port) and
  // Waze/Google's geocoder can resolve them to the wrong place entirely.
  // The GIS coordinates are exact, so they're the reliable choice.
  const destinationParam = encodeURIComponent(lot.lat + "," + lot.lon);

  const updatedAgo = lot.updatedAt
    ? `עודכן ${escapeHtml(formatAgo(lot.updatedAt, nowMs))}`
    : "עודכן בזמן לא ידוע";

  const chips =
    (capacity ? `<span class="popup-chip">${escapeHtml(capacity)} מקומות</span>` : "") +
    (discountPct ? `<span class="popup-chip discount ${discountPct >= DISCOUNT_BIG_TIER_PCT ? "tier-big" : "tier-small"}">-${discountPct}% תושבים</span>` : "");

  const detailRows =
    `<div class="popup-row">עודכן באחוזות החוף: ${lot.updatedAt ? escapeHtml(formatUpdatedAt(lot.updatedAt)) : "לא ידוע"}</div>` +
    (lot.tariffDay ? `<div class="popup-row">${escapeHtml(lot.tariffDay)}</div>` : "") +
    (lot.tariffNight ? `<div class="popup-row">לילה (Night): ${escapeHtml(lot.tariffNight)}</div>` : "") +
    (officialLink ? `<div class="popup-row popup-official"><a href="${officialLink}" target="_blank" rel="noopener noreferrer">לעמוד החניון באתר אחוזות החוף (Official page) ↗</a></div>` : "");

  return '<div class="popup-header">' +
      `<span class="popup-title">${escapeHtml(lot.name || "חניון (Parking lot)")}</span>` +
      `<span class="popup-status-mini" style="background:${info.hex}1a;color:${info.hex}" title="${info.label}">${info.short}</span>` +
    "</div>" +
    `<div class="popup-sub">${escapeHtml(lot.address || "")}${lot.address ? " · " : ""}<span class="popup-updated${isStale ? " stale" : ""}">${updatedAgo}</span></div>` +
    (isStale
      ? '<div class="popup-stale-warning">⚠️ הסטטוס לא עודכן ' +
        escapeHtml(lot.updatedAt ? formatAgo(lot.updatedAt, nowMs).replace(/^לפני /, "מזה ") : "זמן רב") +
        " — ייתכן שאינו מדויק (Status may be outdated)</div>"
      : "") +
    '<div class="popup-nav">' +
      `<a class="popup-nav-btn" href="https://waze.com/ul?ll=${destinationParam}&navigate=yes" target="_blank" rel="noopener noreferrer" aria-label="Waze" title="Waze">` +
        '<img src="waze-icon.png" alt="" width="40" height="40" />' +
      "</a>" +
      `<a class="popup-nav-btn" href="https://www.google.com/maps/dir/?api=1&destination=${destinationParam}" target="_blank" rel="noopener noreferrer" aria-label="Google Maps" title="Google Maps">` +
        '<img src="google-maps-icon.png" alt="" width="40" height="40" />' +
      "</a>" +
      `<button type="button" class="popup-share" data-lot-id="${escapeHtml(lot.id)}" data-lot-name="${escapeHtml(lot.name || "חניון")}" data-latlon="${escapeHtml(lot.lat + "," + lot.lon)}" title="שתף קישור לחניון (Share)" aria-label="שתף (Share)">${SHARE_SVG}</button>` +
    "</div>" +
    (chips ? `<div class="popup-chips">${chips}</div>` : "") +
    '<details class="popup-details">' +
      '<summary>פרטים נוספים ומחירון (Details) <span class="details-chevron">▾</span></summary>' +
      `<div class="popup-details-body">${detailRows}</div>` +
    "</details>" +
    planBHtml(lot, visibleLots, nowMs);
}

export function renderLots(lots) {
  // Snapshot before clearLayers: clearing fires popupclose, nulling it.
  const reopenLotId = openPopupLotId;
  // Also snapshot whether the details expander is open -- the rebuilt
  // popup HTML starts collapsed, and snapping the tariff text shut mid-read
  // on the 2-minute poll is a state loss the old always-visible rows
  // never had.
  const reopenDetailsOpen = !!document.querySelector(".leaflet-popup .popup-details[open]");
  markersLayer.clearLayers();
  markersByLotId = {};
  const nowMs = israelNowMs();
  const autopanPadding = popupAutopanPadding();
  const visibleLots = lots.filter((lot) => {
    return Number.isFinite(lot.lat) && Number.isFinite(lot.lon) &&
      (lot.status || "").trim() !== "סגור";
  });
  lastVisibleLots = visibleLots;
  visibleLots.forEach((lot) => {
    const info = statusInfo(lot.status);
    const isStale = isLotStale(lot, nowMs);

    const normalizedName = normalizeLotName(lot.name);
    const ahuzotId = Object.prototype.hasOwnProperty.call(AHUZOT_LINKS, normalizedName)
      ? AHUZOT_LINKS[normalizedName]
      : undefined;
    const officialLink = ahuzotId ? AHUZOT_LINK_BASE + ahuzotId : undefined;

    // The GIS "tariff notes" field (hearot_taarif) is free text the
    // municipality doesn't always keep in sync with the real discount, so
    // prefer a snapshot of ahuzot.co.il's own numbers (see RESIDENT_DISCOUNT_BY_AHUZOT_ID's
    // comment) and only fall back to parsing the GIS text for lots that
    // snapshot doesn't cover.
    const discountPct = (ahuzotId && RESIDENT_DISCOUNT_BY_AHUZOT_ID[ahuzotId]) || lot.residentDiscountPct;

    // Live feed value first: it's 0/null for ~90 lots (snapshot fills the
    // gap), but when the municipality does populate it, it's newer than
    // the hand-scraped snapshot.
    const capacity = lot.capacity || (ahuzotId && CAPACITY_BY_AHUZOT_ID[ahuzotId]);
    let discountBadge = "";
    if (discountPct) {
      const discountTier = discountPct >= DISCOUNT_BIG_TIER_PCT ? "tier-big" : "tier-small";
      discountBadge = `<span class="discount-badge ${discountTier}">-${discountPct}%</span>`;
    }

    const icon = L.divIcon({ html: pinHtml(info, discountBadge), className: "", iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] });
    const marker = L.marker([lot.lat, lot.lon], { icon: icon });

    marker._lotId = lot.id;
    marker.bindPopup(popupHtml(lot, info, isStale, nowMs, visibleLots, officialLink, capacity, discountPct), autopanPadding);
    marker.bindTooltip(escapeHtml(lot.name || "חניון"), {
      permanent: true,
      direction: "top",
      offset: [0, -34],
      className: "lot-label",
      interactive: false
    });
    markersLayer.addLayer(marker);
    markersByLotId[lot.id] = marker;
  });

  // Re-renders rebuild every marker, which closes any open popup -- so a
  // user reading a popup (or tapping refresh to update it) would watch it
  // vanish. Reopen the same lot's popup with the freshly rendered content.
  if (reopenLotId != null && markersByLotId[reopenLotId]) {
    markersByLotId[reopenLotId].openPopup();
    if (reopenDetailsOpen) {
      const details = document.querySelector(".leaflet-popup .popup-details");
      if (details) details.open = true;
    }
  }

  // Consume the #lot= deep link on the first render, hit or miss -- a
  // miss (unknown/closed lot) must not lie in wait and yank the map to
  // that lot if it reappears in a later auto-refresh. Clear the hash once
  // consumed: otherwise every reload (e.g. mobile tab eviction) would
  // re-hijack the map back to the shared lot instead of the saved view.
  if (pendingDeepLinkLotId != null) {
    const shared = markersByLotId[pendingDeepLinkLotId];
    pendingDeepLinkLotId = null;
    history.replaceState(null, "", location.pathname + location.search);
    if (shared) {
      // animate:false -- openPopup's autopan would cancel an animated
      // setView mid-flight and strand the map at an in-between zoom.
      map.setView(shared.getLatLng(), Math.max(map.getZoom(), 16), { animate: false });
      shared.openPopup();
    }
  }
}

// Opens the popup of the nearest lot to (lat, lon) that the feed doesn't
// say is full, for the address search. Unlike Plan B (which ranks fresh
// statuses first), plain distance wins here: the user asked for the
// closest lot to an address, and the popup itself surfaces staleness.
// Returns false -- so the caller can tell the user -- when lots haven't
// loaded yet or the nearest candidate exceeds SEARCH_MAX_LOT_DISTANCE_M
// (a "nearby" lot kilometers away would just autopan the map off the
// searched address).
export function openNearestOpenLot(lat, lon) {
  let best = null;
  lastVisibleLots.forEach((lot) => {
    if ((lot.status || "").trim() === "מלא") return;
    const dist = distanceMeters(lat, lon, lot.lat, lot.lon);
    if (!best || dist < best.dist) best = { lot, dist };
  });
  if (!best || best.dist > SEARCH_MAX_LOT_DISTANCE_M) return false;
  const marker = markersByLotId[best.lot.id];
  if (!marker) return false;
  marker.openPopup();
  return true;
}

// deepLinkLotId: the #lot= id parsed once by main.js (or null). Delegated
// listeners are registered here exactly once — never per render — or the
// share sheet would double-fire.
export function initMarkers(leafletMap, deepLinkLotId) {
  map = leafletMap;
  pendingDeepLinkLotId = deepLinkLotId;
  markersLayer = L.layerGroup().addTo(map);

  map.on("popupopen", (e) => {
    if (e.popup._source && e.popup._source._lotId != null) openPopupLotId = e.popup._source._lotId;
    // Re-measure control clearance at open time and re-pan: the padding
    // baked in at render time can be minutes old, and the pill grows on
    // error/success flashes (which don't re-render) and on rotation.
    Object.assign(e.popup.options, popupAutopanPadding());
    if (typeof e.popup._adjustPan === "function") e.popup._adjustPan();
  });
  map.on("popupclose", (e) => {
    if (e.popup._source && e.popup._source._lotId === openPopupLotId) openPopupLotId = null;
  });

  map.getContainer().addEventListener("click", onPlanBClick);
  map.getContainer().addEventListener("click", onShareClick);

  // Expanding the details section grows an already-open popup, but Leaflet
  // only auto-pans on open -- without this the grown popup's top half ends
  // up under the map controls. 'toggle' doesn't bubble, so capture it.
  // _adjustPan is private but stable in the pinned leaflet@1.9.4; the
  // public update() is unusable here -- it re-sets the popup's HTML, which
  // would snap the <details> the user just opened back shut.
  map.getContainer().addEventListener("toggle", (e) => {
    if (!e.target.closest || !e.target.closest(".leaflet-popup")) return;
    const marker = openPopupLotId != null && markersByLotId[openPopupLotId];
    const popup = marker && marker.getPopup();
    if (popup && popup.isOpen() && typeof popup._adjustPan === "function") popup._adjustPan();
  }, true);
}
