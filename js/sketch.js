// Shared freehand pointer capture — lasso, doodle, and zones draw through this.
//
// Pointer etiquette (the difference between "toy" and "tool"):
//   - a stroke belongs to ONE pointer; everything else is ignored or handled
//   - pointercancel (palm swipe, browser gesture, notification) aborts cleanly — no ghost ink
//   - pen drawing + stray touch = palm → the touch is ignored, the pen keeps drawing
//   - finger drawing + second finger = pinch intent → the stroke aborts, Leaflet zooms
import { $ } from "./config.js";
import { map, containerLatLng } from "./map.js";
import { state } from "./store.js";

const handlers = {}; // mode -> { style(), onDone(latlngs, meta) }
let sketch = null;   // { pts, pressures, lastPx, line, pointerId, pointerType, zoom }

export function registerSketchMode(mode, h) { handlers[mode] = h; }

function abortSketch() {
  if (!sketch) return;
  sketch.line.remove();
  sketch = null;
}

export function initSketch() {
  $("#map").addEventListener("pointerdown", (e) => {
    const h = handlers[state.mode];
    if (!h) return;
    if (sketch) {
      if (sketch.pointerType === "touch" && e.pointerType === "touch") abortSketch(); // pinch wins
      return; // pen keeps drawing through palm touches
    }
    if (e.pointerType === "touch" && !e.isPrimary) return; // strokes never start on a second finger
    e.preventDefault();
    const ll = containerLatLng(e);
    sketch = {
      pts: [ll],
      pressures: [e.pressure || 0],
      lastPx: [e.clientX, e.clientY],
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      zoom: map.getZoom(),
      line: L.polyline([ll], h.style()).addTo(map),
    };
  }, true);

  window.addEventListener("pointermove", (e) => {
    if (!sketch || e.pointerId !== sketch.pointerId) return;
    const dx = e.clientX - sketch.lastPx[0], dy = e.clientY - sketch.lastPx[1];
    if (dx * dx + dy * dy < 16) return;
    sketch.lastPx = [e.clientX, e.clientY];
    sketch.pts.push(containerLatLng(e));
    sketch.pressures.push(e.pressure || 0);
    sketch.line.setLatLngs(sketch.pts);
  });

  window.addEventListener("pointerup", (e) => {
    if (!sketch || e.pointerId !== sketch.pointerId) return;
    const { pts, pressures, pointerType, zoom, line } = sketch;
    sketch = null;
    line.remove();
    const h = handlers[state.mode];
    if (h) h.onDone(pts, { pressures, pointerType, zoom });
  });

  window.addEventListener("pointercancel", (e) => {
    if (sketch && e.pointerId === sketch.pointerId) abortSketch();
  });
}
