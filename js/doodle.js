// Freehand ink that sticks to the terrain.
import { $, $$ } from "./config.js";
import { doodleLayer } from "./map.js";
import { state, doodles, addDoodle, removeDoodle, clearDoodles } from "./store.js";
import { registerSketchMode } from "./sketch.js";

function drawDoodle(d) {
  L.polyline(d.pts, { color: d.color, weight: 4, lineCap: "round", lineJoin: "round", opacity: 0.85, className: "rough-line" })
    .addTo(doodleLayer)
    ._nipponDoodle = d;
}

export function initDoodle() {
  doodles.forEach(drawDoodle);

  registerSketchMode("pen", {
    style: () => ({ color: state.penColor, weight: 4, lineCap: "round", lineJoin: "round" }),
    onDone(pts) {
      if (pts.length < 2) return;
      const stroke = { color: state.penColor, pts: pts.map((ll) => [+ll.lat.toFixed(6), +ll.lng.toFixed(6)]) };
      addDoodle(stroke);
      drawDoodle(stroke);
    },
  });

  $("#penTray").addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (!sw) return;
    state.penColor = sw.dataset.color;
    $$(".swatch").forEach((s) => s.classList.toggle("active", s === sw));
  });

  $("#penUndo").addEventListener("click", () => {
    const layers = doodleLayer.getLayers();
    if (!layers.length) return;
    const last = layers[layers.length - 1];
    removeDoodle(last._nipponDoodle);
    doodleLayer.removeLayer(last);
  });

  $("#penClear").addEventListener("click", () => {
    if (!doodleLayer.getLayers().length || !confirm("erase ALL the ink? no take-backs.")) return;
    clearDoodles();
    doodleLayer.clearLayers();
  });
}
