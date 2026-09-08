// Entry point: builds the map and its chrome, then keeps lot data flowing —
// initial load, 2-minute polling, and the fetch → render → pill pipeline.

import { REFRESH_INTERVAL_MS } from "./config.js";
import { fetchLots } from "./api.js";
import { createMap } from "./map-setup.js";
import { initBrand, initBottomControls, showBanner, hideBanner } from "./controls.js";
import {
  initFreshnessPill, beginFetch, endFetch, recordFetchSuccess, recordFetchError
} from "./freshness.js";
import { initMarkers, renderLots } from "./markers.js";
import { initSearch } from "./search.js";

// #lot=<oid> deep link: a shared link should land on the shared lot, so it
// overrides the saved-view restore. Consumed once, on the first render
// that has the lot's marker. Parsed here only, then handed to the map (to
// skip the saved view) and to the markers (to open the lot's popup).
function deepLinkLotId() {
  const m = /[#&]lot=(\d+)/.exec(location.hash);
  return m ? m[1] : null;
}
const pendingDeepLinkLotId = deepLinkLotId();

const map = createMap(pendingDeepLinkLotId != null);
initBrand(map);
initFreshnessPill(map, () => loadData(true));
initBottomControls(map);
initMarkers(map, pendingDeepLinkLotId);
initSearch(map);

// isManual: a tap on the freshness pill (as opposed to the auto-poll);
// it makes the pill flash a visible confirmation.
function loadData(isManual) {
  if (!beginFetch()) return;
  fetchLots()
    .then((lots) => {
      renderLots(lots);
      recordFetchSuccess(lots, isManual);
      hideBanner("fetch");
      hideBanner("load");
    })
    .catch((err) => {
      console.error("Failed to load parking data:", err);
      recordFetchError();
      showBanner("לא ניתן לרענן את נתוני החניה, ננסה שוב (Couldn't refresh parking data, will retry) — " + err.message, "fetch");
    })
    .finally(endFetch);
}

// Pause polling while the tab/screen is in the background -- on mobile
// this avoids burning battery/data refreshing a map nobody is looking
// at. Refresh immediately on return, since the data may be stale.
let refreshTimer = null;
function startPolling() {
  if (refreshTimer) return;
  refreshTimer = setInterval(loadData, REFRESH_INTERVAL_MS);
}
function stopPolling() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}
document.addEventListener("visibilitychange", () => {
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
