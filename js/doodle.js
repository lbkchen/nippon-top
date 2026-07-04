// Freehand ink that sticks to the terrain — and now keeps its scale.
//
// Stroke shape: { id, color, w, z, hl?, pts } — w = brush weight at draw zoom z,
// rendered at w·2^(zoom-z) so street-level scribbles stay street-sized. Points are
// simplified on save (Douglas-Peucker) and smoothed on render (Chaikin), which is
// how raw pointer wobble becomes confident ink AND smaller packs at the same time.
import { $, $$, esc, jitter, armCheck, showHint, simplifyPts, chaikin, degPerPx } from "./config.js";
import { map, doodleLayer, containerLatLng } from "./map.js";
import { state, allDoodles, addDoodle, removeDoodle, clearDoodles } from "./store.js";
import { on } from "./bus.js";
import { registerSketchMode } from "./sketch.js";
import { STAMPS } from "./stamps.js";

const HL_W = 14;       // highlighter base weight
const ERASE_PX = 13;   // eraser hit radius, screen px

const inkWeight = (d) => {
  const base = d.w || 4;
  if (d.z == null) return base; // legacy stroke: constant width
  return Math.min(18, Math.max(1.2, base * 2 ** (map.getZoom() - d.z)));
};

// stickers (text + stamps) scale with zoom like the terrain they're stuck to
const stickerScale = (d) => Math.min(3, Math.max(0.3, 2 ** (map.getZoom() - (d.z ?? map.getZoom()))));

function drawSticker(d) {
  const html = d.type === "text"
    ? `<span class="ink-text" style="--c:${d.color};--r:${jitter(d.id, 4)}deg;--s:${stickerScale(d)}">${esc(d.text)}</span>`
    : `<span class="ink-stamp" style="--c:${d.color};--r:${jitter(d.id, 9)}deg;--s:${stickerScale(d)}">${STAMPS[d.kind]?.svg || ""}</span>`;
  const m = L.marker(d.at, {
    icon: L.divIcon({ className: "ink-sticker-wrap", html, iconSize: null }),
    interactive: false, // stickers never eat map drags — the eraser finds them by distance
  }).addTo(doodleLayer);
  m._nipponDoodle = d;
}

function drawDoodle(d) {
  if (d.type === "text" || d.type === "stamp") return drawSticker(d);
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

function stickerNear(layer, pt) {
  const c = map.latLngToContainerPoint(layer.getLatLng());
  return (c.x - pt.x) ** 2 + (c.y - pt.y) ** 2 < 24 * 24;
}

function eraseAt(e) {
  const rect = $("#map").getBoundingClientRect();
  const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  for (const layer of doodleLayer.getLayers()) {
    if (!(layer.getLatLngs ? strokeHit(layer, pt) : stickerNear(layer, pt))) continue;
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
  map.on("zoomend", () => doodleLayer.eachLayer((l) => {
    const d = l._nipponDoodle;
    if (l.setStyle && l.getLatLngs) l.setStyle({ weight: inkWeight(d) });
    else l.getElement()?.firstElementChild?.style.setProperty("--s", stickerScale(d));
  }));

  registerSketchMode("pen", {
    active: () => !state.penErase && !state.penText && !state.penStamp,
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

  // ---------- pickup tools (eraser / text / stamp are mutually exclusive) ----------
  let textInput = null;
  const killTextInput = () => { textInput?.remove(); textInput = null; };

  function disarmTools(except) {
    if (except !== "erase" && state.penErase) {
      state.penErase = false;
      $("#penErase").classList.remove("active");
      $("#map").classList.remove("erasing");
    }
    if (except !== "text" && state.penText) {
      state.penText = false;
      $("#penText").classList.remove("active");
      killTextInput();
    }
    if (except !== "stamp" && state.penStamp) {
      state.penStamp = null;
      $("#penStampBtn").classList.remove("active");
    }
    $("#stampMenu").classList.add("hidden");
  }

  function openTextInput(e) {
    killTextInput();
    const ll = containerLatLng(e);
    const input = document.createElement("input");
    input.className = "ink-text-input";
    input.maxLength = 40;
    input.placeholder = "say something…";
    input.style.left = `${e.clientX}px`;
    input.style.top = `${e.clientY}px`;
    input.style.setProperty("--c", state.penColor);
    document.body.append(input);
    textInput = input;
    setTimeout(() => input.focus(), 0);
    const commit = () => {
      const text = input.value.trim();
      killTextInput();
      if (!text) return;
      const d = { type: "text", text, color: state.penColor, z: map.getZoom(), at: [+ll.lat.toFixed(6), +ll.lng.toFixed(6)] };
      addDoodle(d);
      drawDoodle(d);
      pushOp({ act: "add", strokes: [d] });
    };
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") commit();
      if (ev.key === "Escape") killTextInput();
    });
    input.addEventListener("blur", () => setTimeout(killTextInput, 120));
  }

  // placement taps for text + stamps (dragging is off in pen mode)
  $("#map").addEventListener("pointerdown", (e) => {
    if (state.mode !== "pen") return;
    if (state.penText) {
      e.preventDefault();
      openTextInput(e);
    } else if (state.penStamp) {
      e.preventDefault();
      const ll = containerLatLng(e);
      const d = { type: "stamp", kind: state.penStamp, color: state.penColor, z: map.getZoom(), at: [+ll.lat.toFixed(6), +ll.lng.toFixed(6)] };
      addDoodle(d);
      drawDoodle(d);
      pushOp({ act: "add", strokes: [d] });
    }
  });

  // ---------- tray ----------
  $("#penTray").addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (sw) {
      // color is not a tool switch — an armed stamp/text just changes ink
      state.penColor = sw.dataset.color;
      if (state.penErase) disarmTools();
      $$(".swatch").forEach((s) => s.classList.toggle("active", s === sw));
      return;
    }
    const size = e.target.closest(".pen-size");
    if (size) {
      state.penWidth = +size.dataset.w;
      state.penHl = false;
      $("#penHl").classList.remove("active");
      disarmTools();
      $$(".pen-size").forEach((s) => s.classList.toggle("active", s === size));
    }
  });

  $("#penHl").addEventListener("click", () => {
    state.penHl = !state.penHl;
    disarmTools();
    $("#penHl").classList.toggle("active", state.penHl);
  });

  $("#penErase").addEventListener("click", () => {
    const arming = !state.penErase;
    disarmTools(arming ? "erase" : undefined);
    state.penErase = arming;
    $("#penErase").classList.toggle("active", arming);
    $("#map").classList.toggle("erasing", arming);
    if (arming) showHint("scrub over ink to erase it", 2200);
  });

  $("#penText").addEventListener("click", () => {
    const arming = !state.penText;
    disarmTools(arming ? "text" : undefined);
    state.penText = arming;
    $("#penText").classList.toggle("active", arming);
    if (arming) showHint("tap the map, type, hit enter — words stick to places", 2600);
  });

  const stampMenu = $("#stampMenu");
  for (const [kind, s] of Object.entries(STAMPS)) {
    const b = document.createElement("button");
    b.className = "stamp-pick";
    b.title = s.label;
    b.setAttribute("aria-label", s.label);
    b.innerHTML = s.svg;
    b.addEventListener("click", () => {
      disarmTools("stamp");
      state.penStamp = kind;
      $("#penStampBtn").classList.add("active");
      stampMenu.classList.add("hidden");
      showHint(`stamp armed — tap the map to press it (esc puts it down)`, 2600);
    });
    stampMenu.append(b);
  }
  $("#penStampBtn").addEventListener("click", () => {
    if (state.penStamp) { disarmTools(); return; } // put the stamp down
    if (!stampMenu.classList.contains("hidden")) { stampMenu.classList.add("hidden"); return; }
    const r = $("#penStampBtn").getBoundingClientRect();
    if (window.innerWidth > 940) {
      stampMenu.style.left = `${r.right + 14}px`;
      stampMenu.style.top = `${Math.max(10, r.top - 60)}px`;
    } else {
      stampMenu.style.left = `${Math.min(r.left, window.innerWidth - 190)}px`;
      stampMenu.style.top = `${r.bottom + 8}px`;
    }
    stampMenu.classList.remove("hidden");
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#stampMenu") && !e.target.closest("#penStampBtn")) stampMenu.classList.add("hidden");
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

  // leaving pen mode puts every pickup tool down
  on("mode-changed", (m) => {
    if (m !== "pen") disarmTools();
  });
}
