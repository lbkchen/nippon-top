// Freehand ink that sticks to the terrain.
import { $, $$, armCheck } from "./config.js";
import { doodleLayer } from "./map.js";
import { state, allDoodles, addDoodle, removeDoodle, clearDoodles } from "./store.js";
import { on } from "./bus.js";
import { registerSketchMode } from "./sketch.js";

function drawDoodle(d) {
  L.polyline(d.pts, { color: d.color, weight: 4, lineCap: "round", lineJoin: "round", opacity: 0.85, className: "rough-line" })
    .addTo(doodleLayer)
    ._nipponDoodle = d;
}

function renderDoodles() {
  doodleLayer.clearLayers();
  allDoodles().forEach(drawDoodle);
}

export function initDoodle() {
  renderDoodles();
  on("pack-changed", renderDoodles);

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
    // newest-first, skipping strokes the store won't let us remove
    // (a friend undoing on a shared map shouldn't eat Ken's pack ink)
    const layers = doodleLayer.getLayers();
    for (let i = layers.length - 1; i >= 0; i--) {
      if (removeDoodle(layers[i]._nipponDoodle)) {
        doodleLayer.removeLayer(layers[i]);
        return;
      }
    }
  });

  $("#penClear").addEventListener("click", (e) => {
    if (!doodleLayer.getLayers().length) return;
    if (!armCheck(e.currentTarget, "all?")) return;
    clearDoodles();
    renderDoodles(); // clear only wipes ink you own — redraw what survives
  });
}
