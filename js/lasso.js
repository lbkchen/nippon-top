// The killer feature: loop some pins, see them all at once.
import { showHint, pointInPoly } from "./config.js";
import { map } from "./map.js";
import { state, allPlaces, placePassesFilters } from "./store.js";
import { emit, on } from "./bus.js";
import { setMode } from "./modes.js";
import { registerSketchMode } from "./sketch.js";
import { openSidebar } from "./sidebar.js";
import { promptZoneFromPoints } from "./zones.js";

export function clearLasso(silent) {
  if (state.lasso) state.lasso.layer.remove();
  state.lasso = null;
  if (!silent) emit("refresh-list");
}

export function initLasso() {
  registerSketchMode("lasso", {
    style: () => ({ color: "#2b2b33", weight: 3, dashArray: "8 8", lineCap: "round", lineJoin: "round" }),
    onDone(pts) {
      if (pts.length < 5) { showHint("🪢 that was barely a squiggle — try a bigger loop", 2200); return; }
      const poly = pts.map((ll) => [ll.lat, ll.lng]);
      clearLasso(true);
      const ids = allPlaces().filter((p) => placePassesFilters(p) && pointInPoly(p.lat, p.lng, poly)).map((p) => p.id);
      const layer = L.polygon(poly, { color: "#2b2b33", weight: 3, dashArray: "10 8", fillColor: "#f5b301", fillOpacity: 0.12, className: "rough-line" }).addTo(map);
      state.lasso = { ids, layer, points: poly };
      setMode(null);
      openSidebar();
      showHint(ids.length ? `🪢 got ${ids.length} — they're in the list →` : "🪢 nothing in there… cast a wider net", 2500);
    },
  });

  on("lasso-clear", () => clearLasso());
  on("lasso-save-zone", () => {
    if (!state.lasso) return;
    if (promptZoneFromPoints(state.lasso.points)) clearLasso();
  });
}
