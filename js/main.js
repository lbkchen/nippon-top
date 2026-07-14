// Boot sequence. Order matters only for event-handler registration (pins before sidebar
// so markers refresh before the list renders).
import { map, PAD } from "./map.js";
import { state, groupBounds, allPlaces } from "./store.js";
import * as store from "./store.js";
import { emit } from "./bus.js";
import { initSplash } from "./splash.js";
import { initPins, markers } from "./pins.js";
import { initSidebar } from "./sidebar.js";
import { initModes, setMode } from "./modes.js";
import { initSketch } from "./sketch.js";
import { initLasso } from "./lasso.js";
import { initZones } from "./zones.js";
import { initDoodle } from "./doodle.js";
import { initAddSpot } from "./addspot.js";
import { initChains } from "./chains.js";
import { initCurations, enterHashView } from "./curations.js";
import { initExporter } from "./exporter.js";
import { initRoulette } from "./roulette.js";
import { initLocate } from "./locate.js";
import { initOmnisearch } from "./omnisearch.js";
import { initDetail, openHashSpot } from "./detail.js";
import { initWhatsNew, checkWhatsNew } from "./whatsnew.js";

initSplash();
initPins();
initSidebar();
initModes();
initSketch();
initLasso();
initZones();
initDoodle();
initAddSpot();
initChains();
initCurations();
initExporter();
initRoulette();
initLocate();
initOmnisearch();
initDetail();
initWhatsNew();

map.fitBounds(groupBounds("tokyo"), PAD());
emit("refresh");
// hash view first (a friend pack may hide spots), then the spot link + new-recs check
enterHashView().then(() => { openHashSpot(); checkWhatsNew(); });

// debug/test handle — also handy in devtools
window.__nippon = { map, state, store, markers, emit, setMode };

console.log(
  "%c🗾 NIPPON TOP %cnow with " + allPlaces().length + " extremely correct opinions",
  "font-size:20px;font-weight:bold", "font-size:12px",
);
