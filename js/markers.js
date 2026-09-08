// Lot markers and their popups: re-rendered on every data refresh, plus
// everything popups carry — Plan B nearby alternatives, the share button,
// #lot= deep links, and keeping an open popup alive across re-renders.
// Plan B lives here (not its own module) because it and the popup HTML and
// markersByLotId all need each other; splitting them would only create an
// import cycle.

import { PLANB_COUNT } from "./config.js";
import {
  AHUZOT_LINK_BASE, AHUZOT_LINKS,
  RESIDENT_DISCOUNT_BY_AHUZOT_ID, CAPACITY_BY_AHUZOT_ID
} from "./lot-data.js";
import {
  normalizeLotName, statusInfo, formatUpdatedAt, israelNowMs, formatAgo,
  isLotStale, escapeHtml, distanceMeters, formatDistance
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

// Keeps popups clear of the fixed corner controls when Leaflet auto-pans
// them into view -- without this, a popup near the top can end up under
// the zoom control, and one near the bottom under the legend.
const POPUP_AUTOPAN_PADDING = {
  autoPanPaddingTopLeft: L.point(16, 90),
  autoPanPaddingBottomRight: L.point(190, 160)
};

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
      `<span class="planb-dist">${formatDistance(alt.dist)}</span>` +
      '<span class="planb-chevron">‹</span>' +
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
  const navUrl = "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(btn.getAttribute("data-latlon"));
  if (navigator.share) {
    navigator.share({ title: "חניון " + name, text: "חניון " + name + " — ניווט: " + navUrl, url: url }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add("copied");
      btn.textContent = "הקישור הועתק ✓";
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

function popupHtml(lot, info, isStale, nowMs, visibleLots, officialLink, capacity) {
  // Always navigate by lat/lon, not the lot's street address: addresses
  // like "הנמל 1" are ambiguous (e.g. Tel Aviv Port vs. Jaffa Port) and
  // Waze/Google's geocoder can resolve them to the wrong place entirely.
  // The GIS coordinates are exact, so they're the reliable choice.
  const destinationParam = encodeURIComponent(lot.lat + "," + lot.lon);

  return `<div class="popup-title">${escapeHtml(lot.name || "חניון (Parking lot)")}</div>` +
    `<div class="popup-addr">${escapeHtml(lot.address || "")}</div>` +
    `<div class="popup-status" style="background:${info.hex}1a;color:${info.hex}">${info.label}</div>` +
    `<div class="popup-updated${isStale ? " stale" : ""}">עודכן באחוזות החוף ` +
      (lot.updatedAt
        ? `${escapeHtml(formatAgo(lot.updatedAt, nowMs))} (${escapeHtml(formatUpdatedAt(lot.updatedAt))})`
        : "בזמן לא ידוע (unknown)") + "</div>" +
    (isStale
      ? '<div class="popup-stale-warning">⚠️ הסטטוס לא עודכן ' +
        escapeHtml(lot.updatedAt ? formatAgo(lot.updatedAt, nowMs).replace(/^לפני /, "מזה ") : "זמן רב") +
        " — ייתכן שאינו מדויק (Status may be outdated)</div>"
      : "") +
    '<div class="popup-nav">' +
      `<a href="https://waze.com/ul?ll=${destinationParam}&navigate=yes" target="_blank" rel="noopener noreferrer" aria-label="Waze" title="Waze">` +
        '<img src="waze-icon.png" alt="" width="40" height="40" />' +
      "</a>" +
      `<a href="https://www.google.com/maps/dir/?api=1&destination=${destinationParam}" target="_blank" rel="noopener noreferrer" aria-label="Google Maps" title="Google Maps">` +
        '<img src="google-maps-icon.png" alt="" width="40" height="40" />' +
      "</a>" +
      `<button type="button" class="popup-share" data-lot-id="${escapeHtml(lot.id)}" data-lot-name="${escapeHtml(lot.name || "חניון")}" data-latlon="${escapeHtml(lot.lat + "," + lot.lon)}" title="שתף קישור לחניון (Share)" aria-label="שתף (Share)">${SHARE_SVG}</button>` +
    "</div>" +
    (officialLink ? `<div class="popup-row popup-official"><a href="${officialLink}" target="_blank" rel="noopener noreferrer">לעמוד החניון באתר אחוזות החוף (Official page) ↗</a></div>` : "") +
    (capacity ? `<div class="popup-row">מס׳ מקומות חנייה (Capacity): ${escapeHtml(capacity)}</div>` : "") +
    (lot.tariffDay ? `<div class="popup-row">${escapeHtml(lot.tariffDay)}</div>` : "") +
    (lot.tariffNight ? `<div class="popup-row">לילה (Night): ${escapeHtml(lot.tariffNight)}</div>` : "") +
    planBHtml(lot, visibleLots, nowMs);
}

export function renderLots(lots) {
  // Snapshot before clearLayers: clearing fires popupclose, nulling it.
  const reopenLotId = openPopupLotId;
  markersLayer.clearLayers();
  markersByLotId = {};
  const nowMs = israelNowMs();
  const visibleLots = lots.filter((lot) => {
    return Number.isFinite(lot.lat) && Number.isFinite(lot.lon) &&
      (lot.status || "").trim() !== "סגור";
  });
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
      const discountTier = discountPct >= 60 ? "tier-big" : "tier-small";
      discountBadge = `<span class="discount-badge ${discountTier}">-${discountPct}%</span>`;
    }

    const icon = L.divIcon({ html: pinHtml(info, discountBadge), className: "", iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] });
    const marker = L.marker([lot.lat, lot.lon], { icon: icon });

    marker._lotId = lot.id;
    marker.bindPopup(popupHtml(lot, info, isStale, nowMs, visibleLots, officialLink, capacity), POPUP_AUTOPAN_PADDING);
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

// deepLinkLotId: the #lot= id parsed once by main.js (or null). Delegated
// listeners are registered here exactly once — never per render — or the
// share sheet would double-fire.
export function initMarkers(leafletMap, deepLinkLotId) {
  map = leafletMap;
  pendingDeepLinkLotId = deepLinkLotId;
  markersLayer = L.layerGroup().addTo(map);

  map.on("popupopen", (e) => {
    if (e.popup._source && e.popup._source._lotId != null) openPopupLotId = e.popup._source._lotId;
  });
  map.on("popupclose", (e) => {
    if (e.popup._source && e.popup._source._lotId === openPopupLotId) openPopupLotId = null;
  });

  map.getContainer().addEventListener("click", onPlanBClick);
  map.getContainer().addEventListener("click", onShareClick);
}
