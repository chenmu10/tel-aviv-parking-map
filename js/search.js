// Address search: Photon geocoder (keyless, autocomplete-friendly, decent
// Hebrew), biased and clipped to the Tel Aviv area. Picking a result marks
// the address, zooms there, and opens the nearest not-full lot's popup.

import { nearestOpenLot, openLotPopup } from "./markers.js";

// Same bounds map-setup accepts for saved views: greater Tel Aviv.
// Photon bbox order is minLon,minLat,maxLon,maxLat. lang=he is a 400
// (Photon only supports default/de/en/fr); lang=default returns the local
// (Hebrew) OSM names and also stops the browser's Accept-Language header
// from switching results to English.
const SEARCH_BBOX = "34.6,31.9,34.95,32.25";
const PHOTON_URL = "https://photon.komoot.io/api/" +
  "?limit=5&lang=default&lat=32.08&lon=34.77&bbox=" + SEARCH_BBOX + "&q=";
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

// Photon results are OSM features; compose "main line + area line" from
// whatever naming fields the feature has.
function resultLabel(props) {
  const main = props.name || [props.street, props.housenumber].filter(Boolean).join(" ");
  const area = props.city || props.town || props.village || props.district || "";
  return { main: main || area, area: main ? area : "" };
}

export function initSearch(map) {
  let resultsEl = null;
  let inputEl = null;
  let debounceTimer = null;
  let inFlight = null;
  // The purple dot marking the searched address (cleared on each new pick).
  const searchLayer = L.layerGroup().addTo(map);
  // Photon features for the currently rendered suggestions, by index.
  let currentFeatures = [];

  function clearResults() {
    resultsEl.replaceChildren();
    resultsEl.style.display = "none";
    currentFeatures = [];
  }

  function showNote(text) {
    const note = document.createElement("div");
    note.className = "search-note";
    note.textContent = text;
    resultsEl.replaceChildren(note);
    resultsEl.style.display = "block";
  }

  // Geocoder strings are third-party data; rows are built with textContent
  // (never HTML) so a hostile OSM name can't inject markup.
  function renderResults(features) {
    currentFeatures = features;
    if (!features.length) {
      showNote("לא נמצאו תוצאות (No results)");
      return;
    }
    const rows = features.map((f, i) => {
      const label = resultLabel(f.properties || {});
      const row = document.createElement("div");
      row.className = "search-result";
      row.setAttribute("data-result-index", i);
      const main = document.createElement("div");
      main.textContent = label.main;
      row.appendChild(main);
      if (label.area) {
        const area = document.createElement("div");
        area.className = "search-result-area";
        area.textContent = label.area;
        row.appendChild(area);
      }
      return row;
    });
    resultsEl.replaceChildren(...rows);
    resultsEl.style.display = "block";
  }

  function choose(feature) {
    const label = resultLabel(feature.properties || {});
    const lon = feature.geometry.coordinates[0];
    const lat = feature.geometry.coordinates[1];
    inputEl.value = label.main;
    inputEl.blur();
    clearResults();

    searchLayer.clearLayers();
    L.marker([lat, lon], {
      icon: L.divIcon({ className: "", html: '<div class="search-location-dot"></div>', iconSize: [12, 12] }),
      interactive: false
    }).addTo(searchLayer);

    // animate:false for the same reason as the deep link: the popup's
    // autopan would cancel an animated setView mid-flight.
    map.setView([lat, lon], Math.max(map.getZoom(), 16), { animate: false });
    const lot = nearestOpenLot(lat, lon);
    if (lot) openLotPopup(lot.id);
  }

  function runSearch(query) {
    if (inFlight) inFlight.abort();
    const abort = new AbortController();
    inFlight = abort;
    fetch(PHOTON_URL + encodeURIComponent(query), { signal: abort.signal })
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((json) => {
        if (abort !== inFlight) return; // a newer query superseded this one
        renderResults((json && json.features) || []);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("Address search failed:", err);
        if (abort === inFlight) showNote("שגיאה בחיפוש, נסו שוב (Search failed, try again)");
      });
  }

  const SearchControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function () {
      const div = L.DomUtil.create("div", "search-box");

      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "חיפוש כתובת… (Address search)";
      input.setAttribute("aria-label", "חיפוש כתובת (Address search)");
      div.appendChild(input);

      const results = document.createElement("div");
      results.className = "search-results";
      results.style.display = "none";
      div.appendChild(results);

      inputEl = input;
      resultsEl = results;

      input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        const query = input.value.trim();
        if (query.length < MIN_QUERY_LENGTH) {
          clearResults();
          return;
        }
        debounceTimer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && currentFeatures.length) {
          e.preventDefault();
          choose(currentFeatures[0]);
        } else if (e.key === "Escape") {
          clearResults();
          input.blur();
        }
      });

      results.addEventListener("click", (e) => {
        // Stop the click HERE, not just via disableClickPropagation on the
        // control: choose() removes the clicked row from the DOM, and a
        // click whose target is detached can't be traced back to this
        // control by Leaflet — the map would treat it as a map click and
        // instantly close the popup choose() just opened.
        e.stopPropagation();
        const row = e.target.closest && e.target.closest(".search-result");
        if (!row) return;
        const feature = currentFeatures[Number(row.getAttribute("data-result-index"))];
        if (feature) choose(feature);
      });

      // Typing and scrolling in the box must not pan/zoom the map under it.
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    }
  });
  new SearchControl().addTo(map);
}
