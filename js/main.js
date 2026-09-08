import { REFRESH_INTERVAL_MS, PLANB_COUNT } from "./config.js";
import { fetchLots } from "./api.js";
import { createMap } from "./map-setup.js";
import { initBrand, initBottomControls, showBanner, hideBanner } from "./controls.js";
import {
  initFreshnessPill, beginFetch, endFetch, recordFetchSuccess, recordFetchError
} from "./freshness.js";
import {
  normalizeLotName, statusInfo, formatUpdatedAt, israelNowMs, formatAgo,
  isLotStale, escapeHtml, distanceMeters, formatDistance
} from "./format.js";
import {
  AHUZOT_LINK_BASE, AHUZOT_LINKS,
  RESIDENT_DISCOUNT_BY_AHUZOT_ID, CAPACITY_BY_AHUZOT_ID
} from "./lot-data.js";

// #lot=<oid> deep link: a shared link should land on the shared lot, so it
// overrides the saved-view restore. Consumed once, on the first render
// that has the lot's marker.
function deepLinkLotId() {
  var m = /[#&]lot=(\d+)/.exec(location.hash);
  return m ? m[1] : null;
}
var pendingDeepLinkLotId = deepLinkLotId();

var map = createMap(pendingDeepLinkLotId != null);

var markersLayer = L.layerGroup().addTo(map);

var SVG_NS = "http://www.w3.org/2000/svg";

initBrand(map);

initFreshnessPill(map, function () { loadData(true); });

initBottomControls(map);



// Keeps popups clear of the fixed corner controls when Leaflet auto-pans
// them into view -- without this, a popup near the top can end up under
// the zoom control, and one near the bottom under the legend.
var POPUP_AUTOPAN_PADDING = {
  autoPanPaddingTopLeft: L.point(16, 90),
  autoPanPaddingBottomRight: L.point(190, 160)
};

// Rows deliberately open the alternative's own popup (via the delegated
// click handler below) rather than deep-linking straight into Waze: the
// user should see that lot's update time and stale warning before
// committing to drive there.
function planBHtml(lot, visibleLots, nowMs) {
  var alts = planBAlternatives(lot, visibleLots, nowMs);
  if (!alts.length) return "";
  var rows = alts.map(function (alt) {
    var altInfo = statusInfo(alt.lot.status);
    return '<div class="popup-planb-row' + (alt.isStale ? ' stale' : '') + '" data-lot-id="' + escapeHtml(alt.lot.id) + '">' +
      '<span class="dot" style="background:' + altInfo.hex + '"></span>' +
      (alt.isStale ? '<span class="planb-stale">⚠️</span>' : '') +
      '<span class="planb-name">' + escapeHtml(alt.lot.name || "חניון") + '</span>' +
      '<span class="planb-dist">' + formatDistance(alt.dist) + '</span>' +
      '<span class="planb-chevron">‹</span>' +
      '</div>';
  }).join("");
  return '<div class="popup-planb">' +
    '<div class="popup-planb-title">חניונים קרובים (Nearby lots)</div>' +
    rows + '</div>';
}


// Plan B: the nearest not-full lots, so a driver who arrives at a lot the
// feed got wrong already has somewhere to go next. Prefers lots the feed
// says have room (פנוי/מעט); pads with status-unknown lots only when
// fewer than PLANB_COUNT of those exist nearby.
function planBAlternatives(lot, visibleLots, nowMs) {
  var withRoom = [];
  var unknown = [];
  visibleLots.forEach(function (other) {
    if (other === lot) return;
    var st = (other.status || "").trim();
    if (st === "מלא") return;
    var entry = {
      lot: other,
      dist: distanceMeters(lot.lat, lot.lon, other.lat, other.lon),
      isStale: isLotStale(other, nowMs)
    };
    (st === "פנוי" || st === "מעט" ? withRoom : unknown).push(entry);
  });
  // Fresh statuses outrank stale ones: a stale "available" is a weaker
  // promise than a fresh one, whatever the distance.
  var byFreshThenDist = function (a, b) {
    if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
    return a.dist - b.dist;
  };
  withRoom.sort(byFreshThenDist);
  unknown.sort(byFreshThenDist);
  return withRoom.slice(0, PLANB_COUNT)
    .concat(unknown.slice(0, Math.max(0, PLANB_COUNT - withRoom.length)));
}

// lot id -> its current marker, so Plan B rows can open another lot's
// popup. Rebuilt on every render (markers are recreated each refresh).
var markersByLotId = {};

// Which lot's popup is currently open (null if none) -- lets a re-render
// restore the popup it necessarily closes when rebuilding markers.
var openPopupLotId = null;
map.on("popupopen", function (e) {
  if (e.popup._source && e.popup._source._lotId != null) openPopupLotId = e.popup._source._lotId;
});
map.on("popupclose", function (e) {
  if (e.popup._source && e.popup._source._lotId === openPopupLotId) openPopupLotId = null;
});

map.getContainer().addEventListener("click", function (e) {
  var row = e.target.closest && e.target.closest(".popup-planb-row");
  if (!row) return;
  var marker = markersByLotId[row.getAttribute("data-lot-id")];
  if (marker) marker.openPopup();
});

// Single source of truth for the share glyph: the popup HTML string is
// derived from the same DOM builder used to restore the icon after the
// "copied" flash, so the two can't drift apart.
var SHARE_SVG = createShareIcon().outerHTML;

function createShareIcon() {
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  [[18, 5], [6, 12], [18, 19]].forEach(function (c) {
    var circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", c[0]);
    circle.setAttribute("cy", c[1]);
    circle.setAttribute("r", "3");
    svg.appendChild(circle);
  });
  [[8.6, 10.7, 15.4, 6.3], [8.6, 13.3, 15.4, 17.7]].forEach(function (p) {
    var line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", p[0]);
    line.setAttribute("y1", p[1]);
    line.setAttribute("x2", p[2]);
    line.setAttribute("y2", p[3]);
    svg.appendChild(line);
  });
  return svg;
}

// navigator.share opens the native sheet (the mobile case this is for);
// desktop browsers without it copy the link and flash confirmation.
map.getContainer().addEventListener("click", function (e) {
  var btn = e.target.closest && e.target.closest(".popup-share");
  if (!btn) return;
  var url = location.origin + location.pathname + "#lot=" + btn.getAttribute("data-lot-id");
  var name = btn.getAttribute("data-lot-name");
  // The text carries a Google Maps destination link so nav-oriented share
  // targets (e.g. the Tesla app, which sends destinations to the car and
  // can't parse our deep link) get usable coordinates; human recipients
  // still get the map deep link in the url field.
  var navUrl = "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(btn.getAttribute("data-latlon"));
  if (navigator.share) {
    navigator.share({ title: "חניון " + name, text: "חניון " + name + " — ניווט: " + navUrl, url: url }).catch(function () {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      btn.classList.add("copied");
      btn.textContent = "הקישור הועתק ✓";
      setTimeout(function () {
        btn.classList.remove("copied");
        btn.textContent = "";
        btn.appendChild(createShareIcon());
      }, 1600);
    }).catch(function () {
      // Clipboard can reject (unfocused document, permissions policy);
      // fall back to letting the user copy manually.
      window.prompt("העתק את הקישור (Copy the link):", url);
    });
  } else {
    window.prompt("העתק את הקישור (Copy the link):", url);
  }
});

function renderLots(lots) {
  // Snapshot before clearLayers: clearing fires popupclose, nulling it.
  var reopenLotId = openPopupLotId;
  markersLayer.clearLayers();
  markersByLotId = {};
  var nowMs = israelNowMs();
  var visibleLots = lots.filter(function (lot) {
    return Number.isFinite(lot.lat) && Number.isFinite(lot.lon) &&
      (lot.status || "").trim() !== "סגור";
  });
  visibleLots.forEach(function (lot) {
    var info = statusInfo(lot.status);
    var isStale = isLotStale(lot, nowMs);

    var normalizedName = normalizeLotName(lot.name);
    var ahuzotId = Object.prototype.hasOwnProperty.call(AHUZOT_LINKS, normalizedName)
      ? AHUZOT_LINKS[normalizedName]
      : undefined;
    var officialLink = ahuzotId ? AHUZOT_LINK_BASE + ahuzotId : undefined;

    // The GIS "tariff notes" field (hearot_taarif) is free text the
    // municipality doesn't always keep in sync with the real discount, so
    // prefer a snapshot of ahuzot.co.il's own numbers (see RESIDENT_DISCOUNT_BY_AHUZOT_ID's
    // comment) and only fall back to parsing the GIS text for lots that
    // snapshot doesn't cover.
    var discountPct = (ahuzotId && RESIDENT_DISCOUNT_BY_AHUZOT_ID[ahuzotId]) || lot.residentDiscountPct;

    // Live feed value first: it's 0/null for ~90 lots (snapshot fills the
    // gap), but when the municipality does populate it, it's newer than
    // the hand-scraped snapshot.
    var capacity = lot.capacity || (ahuzotId && CAPACITY_BY_AHUZOT_ID[ahuzotId]);
    var discountBadge = "";
    if (discountPct) {
      var discountTier = discountPct >= 60 ? "tier-big" : "tier-small";
      discountBadge = '<span class="discount-badge ' + discountTier + '">-' + discountPct + '%</span>';
    }

    var html =
      '<div class="pin"><svg width="30" height="40" viewBox="0 0 30 40">' +
      '<path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="' + info.hex + '"/>' +
      '<circle cx="15" cy="15" r="7" fill="#fff"/></svg>' +
      '<span class="letter" style="color:' + info.hex + '">P</span>' +
      discountBadge +
      '</div>';
    var icon = L.divIcon({ html: html, className: "", iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] });
    var marker = L.marker([lot.lat, lot.lon], { icon: icon });

    // Always navigate by lat/lon, not the lot's street address: addresses
    // like "הנמל 1" are ambiguous (e.g. Tel Aviv Port vs. Jaffa Port) and
    // Waze/Google's geocoder can resolve them to the wrong place entirely.
    // The GIS coordinates are exact, so they're the reliable choice.
    var destinationParam = encodeURIComponent(lot.lat + "," + lot.lon);

    var popupHtml =
      '<div class="popup-title">' + escapeHtml(lot.name || "חניון (Parking lot)") + "</div>" +
      '<div class="popup-addr">' + escapeHtml(lot.address || "") + "</div>" +
      '<div class="popup-status" style="background:' + info.hex + '1a;color:' + info.hex + '">' + info.label + "</div>" +
      '<div class="popup-updated' + (isStale ? ' stale' : '') + '">עודכן באחוזות החוף ' +
        (lot.updatedAt
          ? escapeHtml(formatAgo(lot.updatedAt, nowMs)) + ' (' + escapeHtml(formatUpdatedAt(lot.updatedAt)) + ')'
          : "בזמן לא ידוע (unknown)") + "</div>" +
      (isStale
        ? '<div class="popup-stale-warning">⚠️ הסטטוס לא עודכן ' +
          escapeHtml(lot.updatedAt ? formatAgo(lot.updatedAt, nowMs).replace(/^לפני /, "מזה ") : "זמן רב") +
          ' — ייתכן שאינו מדויק (Status may be outdated)</div>'
        : "") +
      '<div class="popup-nav">' +
        '<a href="https://waze.com/ul?ll=' + destinationParam + '&navigate=yes" target="_blank" rel="noopener noreferrer" aria-label="Waze" title="Waze">' +
          '<img src="waze-icon.png" alt="" width="40" height="40" />' +
        "</a>" +
        '<a href="https://www.google.com/maps/dir/?api=1&destination=' + destinationParam + '" target="_blank" rel="noopener noreferrer" aria-label="Google Maps" title="Google Maps">' +
          '<img src="google-maps-icon.png" alt="" width="40" height="40" />' +
        "</a>" +
        '<button type="button" class="popup-share" data-lot-id="' + escapeHtml(lot.id) + '" data-lot-name="' + escapeHtml(lot.name || "חניון") + '" data-latlon="' + escapeHtml(lot.lat + "," + lot.lon) + '" title="שתף קישור לחניון (Share)" aria-label="שתף (Share)">' + SHARE_SVG + "</button>" +
      "</div>" +
      (officialLink ? '<div class="popup-row popup-official"><a href="' + officialLink + '" target="_blank" rel="noopener noreferrer">לעמוד החניון באתר אחוזות החוף (Official page) ↗</a></div>' : "") +
      (capacity ? '<div class="popup-row">מס׳ מקומות חנייה (Capacity): ' + escapeHtml(capacity) + "</div>" : "") +
      (lot.tariffDay ? '<div class="popup-row">' + escapeHtml(lot.tariffDay) + "</div>" : "") +
      (lot.tariffNight ? '<div class="popup-row">לילה (Night): ' + escapeHtml(lot.tariffNight) + "</div>" : "") +
      planBHtml(lot, visibleLots, nowMs);

    marker._lotId = lot.id;
    marker.bindPopup(popupHtml, POPUP_AUTOPAN_PADDING);
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
    var shared = markersByLotId[pendingDeepLinkLotId];
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

function loadData(isManual) {
  if (!beginFetch()) return;
  fetchLots()
    .then(function (lots) {
      renderLots(lots);
      recordFetchSuccess(lots, isManual);
      hideBanner("fetch");
      hideBanner("load");
    })
    .catch(function (err) {
      console.error("Failed to load parking data:", err);
      recordFetchError();
      showBanner("לא ניתן לרענן את נתוני החניה, ננסה שוב (Couldn't refresh parking data, will retry) — " + err.message, "fetch");
    })
    .finally(endFetch);
}

// Pause polling while the tab/screen is in the background -- on mobile
// this avoids burning battery/data refreshing a map nobody is looking
// at. Refresh immediately on return, since the data may be stale.
var refreshTimer = null;
function startPolling() {
  if (refreshTimer) return;
  refreshTimer = setInterval(loadData, REFRESH_INTERVAL_MS);
}
function stopPolling() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}
document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    stopPolling();
  } else {
    loadData();
    startPolling();
  }
});

showBanner("טוען חניונים... (Loading parking lots…)", "load");
loadData();
startPolling();
