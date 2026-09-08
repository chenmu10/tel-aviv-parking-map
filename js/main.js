import {
  REFRESH_INTERVAL_MS, STALE_THRESHOLD_MS,
  STATUS_INFO, STATUS_ORDER,
  VIEW_STORAGE_KEY, DEFAULT_VIEW, LABEL_MIN_ZOOM, PLANB_COUNT
} from "./config.js";
import { RAW_API_URL, fetchLots } from "./api.js";
import {
  normalizeLotName, statusInfo, formatUpdatedAt, israelNowMs, formatAgo,
  isLotStale, escapeHtml, distanceMeters, formatDistance
} from "./format.js";
import {
  AHUZOT_LINK_BASE, AHUZOT_LINKS,
  RESIDENT_DISCOUNT_BY_AHUZOT_ID, CAPACITY_BY_AHUZOT_ID
} from "./lot-data.js";

// Restore the last map view across reloads -- mobile browsers evict the
// tab when users hop to Waze and back, and the reload used to reset the
// view to the city-wide default. Saved views far outside the Tel Aviv
// area (or otherwise malformed) are ignored in favor of the default.
function loadSavedView() {
  try {
    var v = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY));
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) || !Number.isFinite(v.zoom)) return null;
    if (v.lat < 31.9 || v.lat > 32.25 || v.lon < 34.6 || v.lon > 34.95) return null;
    if (v.zoom < 10 || v.zoom > 19) return null;
    return v;
  } catch (e) {
    return null;
  }
}

// #lot=<oid> deep link: a shared link should land on the shared lot, so it
// overrides the saved-view restore. Consumed once, on the first render
// that has the lot's marker.
function deepLinkLotId() {
  var m = /[#&]lot=(\d+)/.exec(location.hash);
  return m ? m[1] : null;
}
var pendingDeepLinkLotId = deepLinkLotId();

var initialView = (pendingDeepLinkLotId ? null : loadSavedView()) || DEFAULT_VIEW;
// maxZoom must live on the map (the old raster layer carried it): without
// it users can zoom past 19, and loadSavedView would then reject the saved
// view and dump them back at the city-wide default on reload.
var map = L.map("map", { center: [initialView.lat, initialView.lon], zoom: initialView.zoom, maxZoom: 19, zoomControl: false });

map.on("moveend", function () {
  try {
    var c = map.getCenter();
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ lat: c.lat, lon: c.lng, zoom: map.getZoom() }));
  } catch (e) { /* storage may be unavailable (private mode); view just won't persist */ }
});

var mapEl = document.getElementById("map");
function updateLabelVisibility() {
  mapEl.classList.toggle("show-labels", map.getZoom() >= LABEL_MIN_ZOOM);
}
map.on("zoomend", updateLabelVisibility);
updateLabelVisibility();

L.control.zoom({ position: "topright" }).addTo(map);

// Basemap: OpenFreeMap's Bright vector style (keyless) via MapLibre GL — a
// colorful basemap replacing the CARTO raster tiles this map had before
// CARTO put its basemap CDN behind an API key. The vector layer needs
// WebGL and two extra CDN scripts, either of which can be missing (older
// GPUs, corporate proxies, script blockers) — in that case fall back to
// plain OSM raster tiles so the app still works, just with plainer tiles.
function addRasterFallbackBasemap() {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
}

if (typeof maplibregl !== "undefined" && typeof L.maplibreGL === "function") {
  try {
    // MapLibre GL renders Hebrew/Arabic labels with reversed letter order
    // unless its RTL text plugin is loaded (runs in a worker; lazy = only
    // fetched once an RTL label is actually on screen).
    var rtlPluginLoad = maplibregl.setRTLTextPlugin(
      "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js",
      true
    );
    if (rtlPluginLoad && typeof rtlPluginLoad.catch === "function") {
      rtlPluginLoad.catch(function (err) {
        console.warn("RTL text plugin failed to load; Hebrew basemap labels may render reversed:", err);
      });
    }
    L.maplibreGL({
      style: "https://tiles.openfreemap.org/styles/bright",
      attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
  } catch (err) {
    console.warn("Vector basemap failed (likely WebGL unavailable); falling back to raster tiles:", err);
    addRasterFallbackBasemap();
  }
} else {
  addRasterFallbackBasemap();
}

var markersLayer = L.layerGroup().addTo(map);
var userLocationLayer = L.layerGroup().addTo(map);

document.getElementById("raw-api-link").href = RAW_API_URL;

var infoBackdrop = document.getElementById("info-modal-backdrop");
function openInfoModal() {
  infoBackdrop.style.display = "flex";
}
function closeInfoModal() {
  infoBackdrop.style.display = "none";
}
document.querySelector("#info-modal .info-close").addEventListener("click", closeInfoModal);
infoBackdrop.addEventListener("click", function (e) {
  if (e.target === infoBackdrop) closeInfoModal();
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeInfoModal();
});

var BrandControl = L.Control.extend({
  options: { position: "topleft" },
  onAdd: function () {
    var div = L.DomUtil.create("div", "brand");
    div.appendChild(document.createTextNode("חניוני אחוזת החוף תל אביב"));

    var icon = document.createElement("span");
    icon.className = "info-icon";
    icon.textContent = "i";
    icon.title = "אודות (About)";
    L.DomEvent.on(icon, "click", function (e) {
      L.DomEvent.stopPropagation(e);
      openInfoModal();
    });
    div.appendChild(icon);

    L.DomEvent.disableClickPropagation(div);
    return div;
  }
});
var SVG_NS = "http://www.w3.org/2000/svg";

new BrandControl().addTo(map);

// Shows when THIS page last pulled the API (client-side clock, unrelated
// to the feed's per-lot Israel-wall-clock timestamps) and doubles as a
// manual refresh button — proof the map isn't frozen.
var freshnessPill = null;
var freshnessText = null;
// Newest tr_status_chenyon across all lots. The feed writes every lot in
// one batch sweep (verified: all timestamps within ~240ms of each other),
// so this single value IS the data's age -- shown in the pill instead of
// per-pin indicators, which would all read the same number.
var sourceUpdatedAt = null;
var fetchInFlight = false;
// The feed sometimes serves rows with null status/timestamp on every lot
// (observed live during an early-morning window). Distinguishes that from
// "first fetch hasn't finished", so the pill doesn't claim to be loading
// forever.
var hasLoadedOnce = false;

var FreshnessControl = L.Control.extend({
  options: { position: "topleft" },
  onAdd: function () {
    var div = L.DomUtil.create("div", "freshness-pill");
    div.title = "בדוק עכשיו אם יש עדכון (Check now for updates)";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "refresh-btn";
    btn.setAttribute("aria-label", "בדוק עכשיו אם יש עדכון (Check now for updates)");
    var icon = document.createElement("span");
    icon.className = "refresh-icon";
    icon.textContent = "↻";
    btn.appendChild(icon);
    div.appendChild(btn);

    var text = document.createElement("span");
    div.appendChild(text);

    // Direct escape hatch when something looks wrong (outage / stale /
    // fetch error): lets users verify against the source without hunting
    // for the info modal. Hidden while everything is healthy (CSS).
    var rawLink = document.createElement("a");
    rawLink.className = "raw-link";
    rawLink.href = RAW_API_URL;
    rawLink.target = "_blank";
    rawLink.rel = "noopener noreferrer";
    rawLink.textContent = "לנתוני המקור ↗";
    rawLink.title = "צפייה בנתונים הגולמיים מהעירייה (View raw source data)";
    L.DomEvent.on(rawLink, "click", function (e) {
      L.DomEvent.stopPropagation(e);
    });
    div.appendChild(rawLink);

    L.DomEvent.on(div, "click", function (e) {
      L.DomEvent.stopPropagation(e);
      loadData(true);
    });
    L.DomEvent.disableClickPropagation(div);

    freshnessPill = div;
    freshnessText = text;
    updateFreshnessPill();
    return div;
  }
});
new FreshnessControl().addTo(map);

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
  var seconds = Math.max(0, Math.round((israelNowMs() - sourceUpdatedAt) / 1000));
  var ago = seconds < 60
    ? "לפני פחות מדקה"
    : seconds < 3600
      ? "לפני " + Math.floor(seconds / 60) + " דק׳"
      : "לפני " + Math.floor(seconds / 3600) + " שע׳";
  freshnessText.textContent = "עדכון אחרון באתר אחוזות החוף: " + ago;
  freshnessPill.classList.toggle("aged", seconds * 1000 > STALE_THRESHOLD_MS);
}
// 60s matches the label's coarsest visible step (minutes).
setInterval(updateFreshnessPill, 60000);

var LegendControl = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    var div = L.DomUtil.create("div", "legend");

    var toggle = document.createElement("div");
    toggle.className = "legend-toggle";
    var chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "▾";
    toggle.appendChild(chevron);
    toggle.appendChild(document.createTextNode("מקרא (Legend)"));
    div.appendChild(toggle);

    var rows = document.createElement("div");
    rows.className = "legend-rows";
    STATUS_ORDER.forEach(function (key) {
      var info = STATUS_INFO[key];
      var row = document.createElement("div");
      row.className = "row";

      var dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = info.hex;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(info.label));

      rows.appendChild(row);
    });

    var discountRow = document.createElement("div");
    discountRow.className = "row";
    var badgeSample = document.createElement("span");
    badgeSample.className = "legend-badge-sample";
    badgeSample.textContent = "-75%";
    discountRow.appendChild(badgeSample);
    discountRow.appendChild(document.createTextNode("הנחת תושב (Resident discount)"));
    rows.appendChild(discountRow);


    div.appendChild(rows);

    L.DomEvent.on(toggle, "click", function (e) {
      L.DomEvent.stopPropagation(e);
      div.classList.toggle("collapsed");
    });
    L.DomEvent.disableClickPropagation(div);

    return div;
  }
});
new LegendControl().addTo(map);

function createLocateIcon() {
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  [[12, 1, 12, 4], [12, 20, 12, 23], [1, 12, 4, 12], [20, 12, 23, 12]].forEach(function (pts) {
    var line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", pts[0]);
    line.setAttribute("y1", pts[1]);
    line.setAttribute("x2", pts[2]);
    line.setAttribute("y2", pts[3]);
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
  });

  var ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", "12");
  ring.setAttribute("cy", "12");
  ring.setAttribute("r", "6");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-width", "2");
  svg.appendChild(ring);

  var dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", "12");
  dot.setAttribute("cy", "12");
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", "currentColor");
  svg.appendChild(dot);

  return svg;
}

var LocateControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd: function () {
    var btn = L.DomUtil.create("button", "locate-btn");
    btn.type = "button";
    btn.title = "מרכז מפה במיקומי (Center map on my location)";
    btn.appendChild(createLocateIcon());
    L.DomEvent.on(btn, "click", function (e) {
      L.DomEvent.stopPropagation(e);
      btn.disabled = true;
      map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    });
    L.DomEvent.disableClickPropagation(btn);
    this._btn = btn;
    return btn;
  }
});
var locateControl = new LocateControl().addTo(map);

map.on("locationfound", function (e) {
  locateControl._btn.disabled = false;
  hideBanner("geo");
  userLocationLayer.clearLayers();
  L.marker(e.latlng, {
    icon: L.divIcon({ className: "", html: '<div class="user-location-dot"></div>', iconSize: [14, 14] }),
    interactive: false
  }).addTo(userLocationLayer);
});

map.on("locationerror", function (e) {
  locateControl._btn.disabled = false;
  showBanner("לא ניתן לאתר את המיקום שלך (Couldn't get your location) — " + e.message, "geo");
});

// Keeps popups clear of the fixed corner controls when Leaflet auto-pans
// them into view -- without this, a popup near the top can end up under
// the zoom control, and one near the bottom under the legend.
var POPUP_AUTOPAN_PADDING = {
  autoPanPaddingTopLeft: L.point(16, 90),
  autoPanPaddingBottomRight: L.point(190, 160)
};

// Tagged with a source ("fetch"/"geo") so one channel's success can't
// clobber an unrelated error from the other channel still on screen.
var banner = document.getElementById("status-banner");
function showBanner(msg, source) {
  banner.textContent = msg;
  banner.dataset.source = source;
  banner.style.display = "block";
}
function hideBanner(source) {
  if (banner.dataset.source && banner.dataset.source !== source) return;
  banner.style.display = "none";
}

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

// isManual: triggered by the pill's refresh button. A tap needs visible
// confirmation even when no pin changed (otherwise "did it work?"), so
// manual refreshes flash a success state; the 2-minute auto-poll stays
// silent to avoid constant chrome noise.
// A manual check usually finds NO new data (the site updates on its own
// schedule), so the flash must say "checked, nothing new" rather than
// "updated" -- otherwise the unchanged age below reads as a broken button.
var successFlashTimer = null;
function flashRefreshSuccess(hasNewData) {
  if (!freshnessPill) return;
  clearTimeout(successFlashTimer);
  freshnessPill.classList.add("success");
  freshnessText.textContent = hasNewData
    ? "✓ התקבלו נתונים חדשים (New data)"
    : "✓ נבדק עכשיו — אין עדכון חדש באתר (No new data)";
  successFlashTimer = setTimeout(function () {
    freshnessPill.classList.remove("success");
    updateFreshnessPill();
  }, 2600);
}

function loadData(isManual) {
  if (fetchInFlight) return;
  fetchInFlight = true;
  if (freshnessPill) freshnessPill.classList.add("loading");
  updateFreshnessPill();
  fetchLots()
    .then(function (lots) {
      renderLots(lots);
      var prevSourceUpdatedAt = sourceUpdatedAt;
      sourceUpdatedAt = lots.reduce(function (max, l) {
        return l.updatedAt && l.updatedAt > max ? l.updatedAt : max;
      }, 0) || null;
      hasLoadedOnce = true;
      if (freshnessPill) freshnessPill.classList.remove("error");
      hideBanner("fetch");
      hideBanner("load");
      // "New data" only when a real timestamp advanced -- a transition to
      // all-null (outage start) is a change, but not good news.
      if (isManual) flashRefreshSuccess(!!sourceUpdatedAt && sourceUpdatedAt !== prevSourceUpdatedAt);
    })
    .catch(function (err) {
      console.error("Failed to load parking data:", err);
      if (freshnessPill) freshnessPill.classList.add("error");
      showBanner("לא ניתן לרענן את נתוני החניה, ננסה שוב (Couldn't refresh parking data, will retry) — " + err.message, "fetch");
    })
    .finally(function () {
      fetchInFlight = false;
      if (freshnessPill) freshnessPill.classList.remove("loading");
      updateFreshnessPill();
    });
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
