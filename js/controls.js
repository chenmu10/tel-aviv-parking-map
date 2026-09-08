// Static map chrome: the status banner, the brand/title control with its
// info modal, the legend, and the locate-me button. The freshness pill has
// enough state to live in its own module (freshness.js).

import { STATUS_INFO, STATUS_ORDER } from "./config.js";
import { RAW_API_URL } from "./api.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// --- Status banner ---------------------------------------------------------

// Tagged with a source ("fetch"/"geo") so one channel's success can't
// clobber an unrelated error from the other channel still on screen.
const banner = document.getElementById("status-banner");

export function showBanner(msg, source) {
  banner.textContent = msg;
  banner.dataset.source = source;
  banner.style.display = "block";
}

export function hideBanner(source) {
  if (banner.dataset.source && banner.dataset.source !== source) return;
  banner.style.display = "none";
}

// --- Brand control + info modal --------------------------------------------

const infoBackdrop = document.getElementById("info-modal-backdrop");

function openInfoModal() {
  infoBackdrop.style.display = "flex";
}

function closeInfoModal() {
  infoBackdrop.style.display = "none";
}

function initInfoModal() {
  document.getElementById("raw-api-link").href = RAW_API_URL;
  document.querySelector("#info-modal .info-close").addEventListener("click", closeInfoModal);
  infoBackdrop.addEventListener("click", (e) => {
    if (e.target === infoBackdrop) closeInfoModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeInfoModal();
  });
}

const BrandControl = L.Control.extend({
  options: { position: "topleft" },
  onAdd: function () {
    const div = L.DomUtil.create("div", "brand");
    div.appendChild(document.createTextNode("חניוני אחוזת החוף תל אביב"));

    const icon = document.createElement("span");
    icon.className = "info-icon";
    icon.textContent = "i";
    icon.title = "אודות (About)";
    L.DomEvent.on(icon, "click", (e) => {
      L.DomEvent.stopPropagation(e);
      openInfoModal();
    });
    div.appendChild(icon);

    L.DomEvent.disableClickPropagation(div);
    return div;
  }
});

// --- Legend -----------------------------------------------------------------

const LegendControl = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    const div = L.DomUtil.create("div", "legend");

    const toggle = document.createElement("div");
    toggle.className = "legend-toggle";
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = "▾";
    toggle.appendChild(chevron);
    toggle.appendChild(document.createTextNode("מקרא (Legend)"));
    div.appendChild(toggle);

    const rows = document.createElement("div");
    rows.className = "legend-rows";
    STATUS_ORDER.forEach((key) => {
      const info = STATUS_INFO[key];
      const row = document.createElement("div");
      row.className = "row";

      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = info.hex;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(info.label));

      rows.appendChild(row);
    });

    const discountRow = document.createElement("div");
    discountRow.className = "row";
    const badgeSample = document.createElement("span");
    badgeSample.className = "legend-badge-sample";
    badgeSample.textContent = "-75%";
    discountRow.appendChild(badgeSample);
    discountRow.appendChild(document.createTextNode("הנחת תושב (Resident discount)"));
    rows.appendChild(discountRow);

    div.appendChild(rows);

    L.DomEvent.on(toggle, "click", (e) => {
      L.DomEvent.stopPropagation(e);
      div.classList.toggle("collapsed");
    });
    L.DomEvent.disableClickPropagation(div);

    return div;
  }
});

// --- Locate button -----------------------------------------------------------

function createLocateIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  [[12, 1, 12, 4], [12, 20, 12, 23], [1, 12, 4, 12], [20, 12, 23, 12]].forEach((pts) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", pts[0]);
    line.setAttribute("y1", pts[1]);
    line.setAttribute("x2", pts[2]);
    line.setAttribute("y2", pts[3]);
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
  });

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", "12");
  ring.setAttribute("cy", "12");
  ring.setAttribute("r", "6");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-width", "2");
  svg.appendChild(ring);

  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", "12");
  dot.setAttribute("cy", "12");
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", "currentColor");
  svg.appendChild(dot);

  return svg;
}

const LocateControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd: function (map) {
    const btn = L.DomUtil.create("button", "locate-btn");
    btn.type = "button";
    btn.title = "מרכז מפה במיקומי (Center map on my location)";
    btn.appendChild(createLocateIcon());
    L.DomEvent.on(btn, "click", (e) => {
      L.DomEvent.stopPropagation(e);
      btn.disabled = true;
      map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    });
    L.DomEvent.disableClickPropagation(btn);
    this._btn = btn;
    return btn;
  }
});

function initLocate(map) {
  const locateControl = new LocateControl().addTo(map);
  const userLocationLayer = L.layerGroup().addTo(map);

  map.on("locationfound", (e) => {
    locateControl._btn.disabled = false;
    hideBanner("geo");
    userLocationLayer.clearLayers();
    L.marker(e.latlng, {
      icon: L.divIcon({ className: "", html: '<div class="user-location-dot"></div>', iconSize: [14, 14] }),
      interactive: false
    }).addTo(userLocationLayer);
  });

  map.on("locationerror", (e) => {
    locateControl._btn.disabled = false;
    showBanner("לא ניתן לאתר את המיקום שלך (Couldn't get your location) — " + e.message, "geo");
  });
}

// --- Init --------------------------------------------------------------------

// Adds the brand control only; the freshness pill (also topleft) is added by
// freshness.js right after, so the pill sits below the brand as before.
export function initBrand(map) {
  initInfoModal();
  new BrandControl().addTo(map);
}

export function initBottomControls(map) {
  new LegendControl().addTo(map);
  initLocate(map);
}
