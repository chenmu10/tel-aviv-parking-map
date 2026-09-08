// Creating the Leaflet map: initial view (saved or default), view
// persistence, zoom-gated lot-name labels, and the basemap with its
// raster fallback.

import { VIEW_STORAGE_KEY, DEFAULT_VIEW, LABEL_MIN_ZOOM } from "./config.js";

// Restore the last map view across reloads -- mobile browsers evict the
// tab when users hop to Waze and back, and the reload used to reset the
// view to the city-wide default. Saved views far outside the Tel Aviv
// area (or otherwise malformed) are ignored in favor of the default.
function loadSavedView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY));
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) || !Number.isFinite(v.zoom)) return null;
    if (v.lat < 31.9 || v.lat > 32.25 || v.lon < 34.6 || v.lon > 34.95) return null;
    if (v.zoom < 10 || v.zoom > 19) return null;
    return v;
  } catch (e) {
    return null;
  }
}

// Basemap: OpenFreeMap's Bright vector style (keyless) via MapLibre GL — a
// colorful basemap replacing the CARTO raster tiles this map had before
// CARTO put its basemap CDN behind an API key. The vector layer needs
// WebGL and two extra CDN scripts, either of which can be missing (older
// GPUs, corporate proxies, script blockers) — in that case fall back to
// plain OSM raster tiles so the app still works, just with plainer tiles.
function addRasterFallbackBasemap(map) {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
}

function addBasemap(map) {
  if (typeof maplibregl === "undefined" || typeof L.maplibreGL !== "function") {
    addRasterFallbackBasemap(map);
    return;
  }
  try {
    // MapLibre GL renders Hebrew/Arabic labels with reversed letter order
    // unless its RTL text plugin is loaded (runs in a worker; lazy = only
    // fetched once an RTL label is actually on screen).
    const rtlPluginLoad = maplibregl.setRTLTextPlugin(
      "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js",
      true
    );
    if (rtlPluginLoad && typeof rtlPluginLoad.catch === "function") {
      rtlPluginLoad.catch((err) => {
        console.warn("RTL text plugin failed to load; Hebrew basemap labels may render reversed:", err);
      });
    }
    L.maplibreGL({
      style: "https://tiles.openfreemap.org/styles/bright",
      attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
  } catch (err) {
    console.warn("Vector basemap failed (likely WebGL unavailable); falling back to raster tiles:", err);
    addRasterFallbackBasemap(map);
  }
}

// skipSavedView: a #lot= deep link overrides the saved-view restore, so the
// shared lot (not the user's last position) is what opens.
export function createMap(skipSavedView) {
  const initialView = (skipSavedView ? null : loadSavedView()) || DEFAULT_VIEW;
  // maxZoom must live on the map (the old raster layer carried it): without
  // it users can zoom past 19, and loadSavedView would then reject the saved
  // view and dump them back at the city-wide default on reload.
  const map = L.map("map", { center: [initialView.lat, initialView.lon], zoom: initialView.zoom, maxZoom: 19, zoomControl: false });

  map.on("moveend", () => {
    try {
      const c = map.getCenter();
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ lat: c.lat, lon: c.lng, zoom: map.getZoom() }));
    } catch (e) { /* storage may be unavailable (private mode); view just won't persist */ }
  });

  // Lot-name labels only render once zoomed in enough that pins have spread
  // out -- with ~90 lots, showing them at the full-city zoom would be an
  // unreadable overlapping mess (see LABEL_MIN_ZOOM).
  const mapEl = document.getElementById("map");
  const updateLabelVisibility = () => {
    mapEl.classList.toggle("show-labels", map.getZoom() >= LABEL_MIN_ZOOM);
  };
  map.on("zoomend", updateLabelVisibility);
  updateLabelVisibility();

  L.control.zoom({ position: "topright" }).addTo(map);

  addBasemap(map);
  return map;
}
