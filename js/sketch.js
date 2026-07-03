// Shared freehand pointer capture — lasso and doodle both draw through this.
import { $ } from "./config.js";
import { map, containerLatLng } from "./map.js";
import { state } from "./store.js";

const handlers = {}; // mode -> { style(), onDone(latlngs) }
let sketch = null;   // { pts, lastPx, line }

export function registerSketchMode(mode, h) { handlers[mode] = h; }

export function initSketch() {
  $("#map").addEventListener("pointerdown", (e) => {
    const h = handlers[state.mode];
    if (!h || !e.isPrimary) return;
    e.preventDefault();
    const ll = containerLatLng(e);
    sketch = { pts: [ll], lastPx: [e.clientX, e.clientY], line: L.polyline([ll], h.style()).addTo(map) };
  }, true);

  window.addEventListener("pointermove", (e) => {
    if (!sketch || !e.isPrimary) return;
    const dx = e.clientX - sketch.lastPx[0], dy = e.clientY - sketch.lastPx[1];
    if (dx * dx + dy * dy < 16) return;
    sketch.lastPx = [e.clientX, e.clientY];
    sketch.pts.push(containerLatLng(e));
    sketch.line.setLatLngs(sketch.pts);
  });

  window.addEventListener("pointerup", () => {
    if (!sketch) return;
    const { pts, line } = sketch;
    sketch = null;
    line.remove();
    const h = handlers[state.mode];
    if (h) h.onDone(pts);
  });
}
