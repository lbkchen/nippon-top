// Freehand ink that sticks to the terrain — and now keeps its scale.
//
// Stroke shape: { id, color, w, z, hl?, pts } — w = brush weight at draw zoom z,
// rendered at w·2^(zoom-z) so street-level scribbles stay street-sized. Points are
// simplified on save (Douglas-Peucker) and smoothed on render (Chaikin), which is
// how raw pointer wobble becomes confident ink AND smaller packs at the same time.
import { $, $$, armCheck, showHint, simplifyPts, chaikin, degPerPx } from "./config.js";
import { map, doodleLayer } from "./map.js";
import { state, allDoodles, addDoodle, removeDoodle, clearDoodles } from "./store.js";
import { on } from "./bus.js";
import { registerSketchMode } from "./sketch.js";

const HL_W = 14;       // highlighter base weight
const ERASE_PX = 13;   // eraser hit radius, screen px

const inkWeight = (d) => {
  const base = d.w || 4;
  if (d.z == null) return base; // legacy stroke: constant width
  return Math.min(18, Math.max(1.2, base * 2 ** (map.getZoom() - d.z)));
};

function drawDoodle(d) {
  L.polyline(chaikin(d.pts, 2), {
    color: d.color,
    weight: inkWeight(d),
    lineCap: "round",
    lineJoin: "round",
    opacity: d.hl ? 0.38 : 0.85,
    className: "rough-line",
  }).addTo(doodleLayer)._nipponDoodle = d;
}

function renderDoodles() {
  doodleLayer.clearLayers();
  allDoodles().forEach(drawDoodle);
}

// ---------- session undo/redo (ops, not layers) ----------
let undoStack = [], redoStack = [];
const pushOp = (op) => {
  undoStack.push(op);
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
};
function applyOp(op, invert) {
  const act = invert ? (op.act === "add" ? "remove" : "add") : op.act;
  let did = false;
  for (const s of op.strokes) did = (act === "add" ? (addDoodle(s), true) : removeDoodle(s)) || did;
  renderDoodles();
  return did;
}

// ---------- eraser ----------
function strokeHit(layer, pt) {
  const lls = layer.getLatLngs();
  let prev = map.latLngToContainerPoint(lls[0]);
  for (let i = 1; i < lls.length; i++) {
    const cur = map.latLngToContainerPoint(lls[i]);
    const dx = cur.x - prev.x, dy = cur.y - prev.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt.x - prev.x) * dx + (pt.y - prev.y) * dy) / len2));
    const ex = prev.x + t * dx - pt.x, ey = prev.y + t * dy - pt.y;
    if (ex * ex + ey * ey < ERASE_PX * ERASE_PX) return true;
    prev = cur;
  }
  return false;
}

function eraseAt(e) {
  const rect = $("#map").getBoundingClientRect();
  const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  for (const layer of doodleLayer.getLayers()) {
    if (!strokeHit(layer, pt)) continue;
    const d = layer._nipponDoodle;
    if (removeDoodle(d)) {
      doodleLayer.removeLayer(layer);
      pushOp({ act: "remove", strokes: [d] });
    } else if (!eraseAt._nagged) {
      eraseAt._nagged = true;
      showHint("that ink came with the map — it's not yours to erase", 2600);
      setTimeout(() => { eraseAt._nagged = false; }, 4000);
    }
    return;
  }
}

export function initDoodle() {
  renderDoodles();
  on("pack-changed", renderDoodles);
  map.on("zoomend", () => doodleLayer.eachLayer((l) => l.setStyle({ weight: inkWeight(l._nipponDoodle) })));

  registerSketchMode("pen", {
    active: () => !state.penErase,
    style: () => ({
      color: state.penColor,
      weight: state.penHl ? HL_W : state.penWidth,
      opacity: state.penHl ? 0.38 : 1,
      lineCap: "round",
      lineJoin: "round",
    }),
    onDone(pts, { pressures, pointerType, zoom } = {}) {
      if (pts.length < 2) return;
      let w = state.penHl ? HL_W : state.penWidth;
      if (pointerType === "pen" && pressures?.some((p) => p > 0)) {
        const avg = pressures.reduce((a, b) => a + b, 0) / pressures.length;
        w = Math.min(20, Math.max(1.5, w * (0.5 + avg))); // Pencil pressure earns its keep
      }
      const tol = 1.6 * degPerPx(zoom ?? map.getZoom());
      const stroke = {
        color: state.penColor,
        w: +w.toFixed(1),
        z: zoom ?? map.getZoom(),
        ...(state.penHl ? { hl: true } : {}),
        pts: simplifyPts(pts.map((ll) => [+ll.lat.toFixed(6), +ll.lng.toFixed(6)]), tol),
      };
      addDoodle(stroke);
      drawDoodle(stroke);
      pushOp({ act: "add", strokes: [stroke] });
    },
  });

  // ---------- tray ----------
  $("#penTray").addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (sw) {
      state.penColor = sw.dataset.color;
      state.penErase = false;
      $("#penErase").classList.remove("active");
      $$(".swatch").forEach((s) => s.classList.toggle("active", s === sw));
      return;
    }
    const size = e.target.closest(".pen-size");
    if (size) {
      state.penWidth = +size.dataset.w;
      state.penHl = false;
      state.penErase = false;
      $("#penHl").classList.remove("active");
      $("#penErase").classList.remove("active");
      $$(".pen-size").forEach((s) => s.classList.toggle("active", s === size));
    }
  });

  $("#penHl").addEventListener("click", () => {
    state.penHl = !state.penHl;
    state.penErase = false;
    $("#penErase").classList.remove("active");
    $("#penHl").classList.toggle("active", state.penHl);
  });

  $("#penErase").addEventListener("click", () => {
    state.penErase = !state.penErase;
    $("#penErase").classList.toggle("active", state.penErase);
    $("#map").classList.toggle("erasing", state.penErase);
    if (state.penErase) showHint("scrub over ink to erase it", 2200);
  });

  // eraser scrubbing: only in pen mode with the eraser picked up
  let erasing = false;
  $("#map").addEventListener("pointerdown", (e) => {
    if (state.mode !== "pen" || !state.penErase) return;
    erasing = true;
    eraseAt(e);
  });
  window.addEventListener("pointermove", (e) => { if (erasing && state.penErase) eraseAt(e); });
  window.addEventListener("pointerup", () => { erasing = false; });
  window.addEventListener("pointercancel", () => { erasing = false; });

  $("#penUndo").addEventListener("click", () => {
    for (let op; (op = undoStack.pop()); ) {
      redoStack.push(op);
      if (applyOp(op, true)) return; // skip ops whose strokes got saved away (pack edits)
    }
  });

  $("#penRedo").addEventListener("click", () => {
    for (let op; (op = redoStack.pop()); ) {
      undoStack.push(op);
      if (applyOp(op, false)) return;
    }
  });

  $("#penInk").addEventListener("click", (e) => {
    state.inkOn = !state.inkOn;
    e.currentTarget.classList.toggle("active", !state.inkOn);
    if (state.inkOn) doodleLayer.addTo(map); else doodleLayer.remove();
  });

  $("#penClear").addEventListener("click", (e) => {
    if (!doodleLayer.getLayers().length) return;
    if (!armCheck(e.currentTarget, "all?")) return;
    const before = allDoodles();
    clearDoodles();
    const gone = before.filter((d) => !allDoodles().includes(d));
    if (gone.length) pushOp({ act: "remove", strokes: gone });
    renderDoodles(); // clear only wipes ink you own — redraw what survives
  });

  // ESC drops the eraser along with the mode
  on("mode-changed", (m) => {
    if (m !== "pen" && state.penErase) {
      state.penErase = false;
      $("#penErase").classList.remove("active");
      $("#map").classList.remove("erasing");
    }
  });
}
