// Freehand ink that sticks to the terrain — and now keeps its scale.
//
// Stroke shape: { id, color, w, z, hl?, pts } — w = brush weight at draw zoom z,
// rendered at w·2^(zoom-z) so street-level scribbles stay street-sized. Points are
// simplified on save (Douglas-Peucker) and smoothed on render (Chaikin), which is
// how raw pointer wobble becomes confident ink AND smaller packs at the same time.
// Stickers ({ type:"text"|"stamp", at, z, s? }) are grabbable in pen mode: drag
// to move, tap for the mini menu (resize / reword / peel off).
import { $, $$, esc, jitter, armCheck, showHint, simplifyPts, chaikin, degPerPx } from "./config.js";
import { map, doodleLayer, containerLatLng } from "./map.js";
import { state, allDoodles, addDoodle, removeDoodle, updateDoodle, ownsDoodle, clearDoodles } from "./store.js";
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

// stickers (text + stamps) scale with zoom like the terrain they're stuck to,
// times whatever size the mini menu dialed in (d.s)
const stickerScale = (d) =>
  Math.min(3, Math.max(0.3, 2 ** (map.getZoom() - (d.z ?? map.getZoom())))) * (d.s || 1);

function drawSticker(d) {
  const mine = ownsDoodle(d) ? " mine" : "";
  const html = d.type === "text"
    ? `<span class="ink-text${mine}" style="--c:${d.color};--r:${jitter(d.id, 4)}deg;--s:${stickerScale(d)}">${esc(d.text)}</span>`
    : `<span class="ink-stamp${mine}" style="--c:${d.color};--r:${jitter(d.id, 9)}deg;--s:${stickerScale(d)}">${STAMPS[d.kind]?.svg || ""}</span>`;
  const m = L.marker(d.at, {
    icon: L.divIcon({ className: "ink-sticker-wrap", html, iconSize: null }),
    interactive: false, // the map never sees stickers — grabbing is our own pointer capture
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
  closeStickerMenu(); // layers get rebuilt — any selection would go stale
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
  if (op.act === "update") {
    if (!updateDoodle(op.d, invert ? op.before : op.after)) return false;
    renderDoodles();
    return true;
  }
  const act = invert ? (op.act === "add" ? "remove" : "add") : op.act;
  let did = false;
  for (const s of op.strokes) did = (act === "add" ? (addDoodle(s), true) : removeDoodle(s)) || did;
  renderDoodles();
  return did;
}

// ---------- sticker selection (module scope: renderDoodles must reset it) ----------
let stickerSel = null; // { layer, d, span }
function closeStickerMenu() {
  $("#stickerMenu").classList.add("hidden");
  stickerSel?.span.classList.remove("sel");
  stickerSel = null;
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
  map.on("zoomstart movestart", closeStickerMenu); // menu position goes stale with the view

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

  // ---------- tools (one in hand at a time: brush/hl or eraser or text or stamp) ----------
  let textInput = null;
  const killTextInput = () => { textInput?.remove(); textInput = null; };

  function disarmTools(except) {
    if (except !== "hl" && state.penHl) {
      state.penHl = false;
      $("#penHl").classList.remove("active");
    }
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
    closeStickerMenu();
  }

  function openTextEditor(x, y, initial, onCommit) {
    killTextInput();
    const input = document.createElement("input");
    input.className = "ink-text-input";
    input.maxLength = 40;
    input.placeholder = "say something…";
    input.value = initial || "";
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.setProperty("--c", state.penColor);
    document.body.append(input);
    textInput = input;
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const commit = () => {
      const text = input.value.trim();
      killTextInput();
      if (text) onCommit(text);
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
      const ll = containerLatLng(e);
      openTextEditor(e.clientX, e.clientY, "", (text) => {
        const d = { type: "text", text, color: state.penColor, z: map.getZoom(), at: [+ll.lat.toFixed(6), +ll.lng.toFixed(6)] };
        addDoodle(d);
        drawDoodle(d);
        pushOp({ act: "add", strokes: [d] });
      });
    } else if (state.penStamp) {
      e.preventDefault();
      const ll = containerLatLng(e);
      const d = { type: "stamp", kind: state.penStamp, color: state.penColor, z: map.getZoom(), at: [+ll.lat.toFixed(6), +ll.lng.toFixed(6)] };
      addDoodle(d);
      drawDoodle(d);
      pushOp({ act: "add", strokes: [d] });
    }
  });

  // ---------- sticker grab: drag moves it, a clean tap opens the mini menu ----------
  const stickerMenu = $("#stickerMenu");

  function findStickerLayer(span) {
    let hit = null;
    doodleLayer.eachLayer((l) => { if (!hit && !l.getLatLngs && l.getElement()?.contains(span)) hit = l; });
    return hit;
  }

  function openStickerMenu(layer, d, span) {
    closeStickerMenu();
    stickerSel = { layer, d, span };
    span.classList.add("sel");
    $("#stReword").classList.toggle("hidden", d.type !== "text");
    const pt = map.latLngToContainerPoint(layer.getLatLng());
    const rect = $("#map").getBoundingClientRect();
    stickerMenu.classList.remove("hidden");
    const x = rect.left + pt.x + 30, y = rect.top + pt.y - stickerMenu.offsetHeight / 2;
    stickerMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - stickerMenu.offsetWidth - 8))}px`;
    stickerMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - stickerMenu.offsetHeight - 8))}px`;
  }

  // capture phase: a grabbed sticker must beat the sketch + placement handlers
  $("#map").addEventListener("pointerdown", (e) => {
    if (state.mode !== "pen" || state.penErase) return;
    const span = e.target.closest?.(".ink-text.mine, .ink-stamp.mine");
    if (!span) return;
    const layer = findStickerLayer(span);
    const d = layer?._nipponDoodle;
    if (!d || !ownsDoodle(d)) return;
    e.stopPropagation();
    e.preventDefault();
    const id = e.pointerId;
    const startX = e.clientX, startY = e.clientY;
    const before = [...d.at];
    let moved = false;
    const onMove = (ev) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) {
        moved = true;
        closeStickerMenu();
        span.classList.add("dragging");
      }
      if (moved) layer.setLatLng(containerLatLng(ev));
    };
    const onUp = (ev) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      span.classList.remove("dragging");
      if (ev.type === "pointercancel") { layer.setLatLng(before); return; }
      if (moved) {
        const ll = layer.getLatLng();
        const at = [+ll.lat.toFixed(6), +ll.lng.toFixed(6)];
        updateDoodle(d, { at });
        pushOp({ act: "update", d, before: { at: before }, after: { at } });
      } else {
        openStickerMenu(layer, d, span);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, true);

  const reScale = (f) => {
    if (!stickerSel) return;
    const { d, span } = stickerSel;
    const before = d.s || 1;
    const s = Math.min(4, Math.max(0.4, +(before * f).toFixed(2)));
    if (s === before) return;
    updateDoodle(d, { s });
    span.style.setProperty("--s", stickerScale(d));
    pushOp({ act: "update", d, before: { s: before }, after: { s } });
  };
  $("#stBigger").addEventListener("click", () => reScale(1.3));
  $("#stSmaller").addEventListener("click", () => reScale(1 / 1.3));
  $("#stReword").addEventListener("click", () => {
    if (!stickerSel) return;
    const { layer, d } = stickerSel;
    closeStickerMenu();
    const pt = map.latLngToContainerPoint(layer.getLatLng());
    const rect = $("#map").getBoundingClientRect();
    openTextEditor(rect.left + pt.x, rect.top + pt.y, d.text, (text) => {
      const before = d.text;
      updateDoodle(d, { text });
      pushOp({ act: "update", d, before: { text: before }, after: { text } });
      renderDoodles();
    });
  });
  $("#stPeel").addEventListener("click", () => {
    if (!stickerSel) return;
    const { layer, d } = stickerSel;
    closeStickerMenu();
    if (removeDoodle(d)) {
      doodleLayer.removeLayer(layer);
      pushOp({ act: "remove", strokes: [d] });
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#stickerMenu") && !e.target.closest(".ink-text, .ink-stamp")) closeStickerMenu();
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
      disarmTools(); // picking a size means "back to the plain brush"
      $$(".pen-size").forEach((s) => s.classList.toggle("active", s === size));
    }
  });

  $("#penHl").addEventListener("click", () => {
    const arming = !state.penHl;
    disarmTools(arming ? "hl" : undefined);
    state.penHl = arming;
    $("#penHl").classList.toggle("active", arming);
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
      showHint(`"${s.label}" armed — tap the map to press it (esc puts it down)`, 2600);
    });
    stampMenu.append(b);
  }
  $("#penStampBtn").addEventListener("click", () => {
    if (state.penStamp) { disarmTools(); return; } // put the stamp down
    if (!stampMenu.classList.contains("hidden")) { stampMenu.classList.add("hidden"); return; }
    const r = $("#penStampBtn").getBoundingClientRect();
    stampMenu.classList.remove("hidden"); // unhide first so offsetWidth/Height measure
    if (window.innerWidth > 940) {
      stampMenu.style.left = `${r.right + 14}px`;
      stampMenu.style.top = `${Math.max(10, r.top - 60)}px`;
    } else {
      // the tray docks at the bottom on mobile — the picker opens above the whole tray
      const trayTop = $("#penTray").getBoundingClientRect().top;
      stampMenu.style.left = `${Math.max(10, Math.min(r.left, window.innerWidth - stampMenu.offsetWidth - 10))}px`;
      stampMenu.style.top = `${Math.max(10, trayTop - stampMenu.offsetHeight - 10)}px`;
    }
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
    if (!armCheck(e.currentTarget, "tap again to wipe it ALL")) return;
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
