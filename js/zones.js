// Ski-map style vibe zones: colored areas with label stickers.
// Draw one via the zones menu (freehand) or save a lasso as a zone — both land
// in the same naming modal, which also handles re-editing an existing zone.
// Zones know what's inside them: the popup and drawer can scope the sidebar
// to a zone's recs (lasso-style), and every zone can hide individually.
import { $, esc, linkify, showHint, armCheck, labelPoint, pointInPoly, simplifyPts, chaikin, degPerPx, ZONE_COLORS } from "./config.js";
import { map, zoneLayer } from "./map.js";
import {
  state, allPlaces, allZones, addZone, updateZone, removeZone, zoneCount,
  zoneHidden, toggleZoneHidden, curationVisibleIds,
} from "./store.js";
import { emit, on } from "./bus.js";
import { setMode } from "./modes.js";
import { registerSketchMode } from "./sketch.js";

let pendingPoints = null;
let editingZone = null; // zone being retouched via the modal (null = staking a new one)
let pickedColor = ZONE_COLORS[0];
let pickedFill = "solid";
let pickedStar = false;
let preview = null;        // live polygon shown while the naming modal is open
let previewSkipId = null;  // the zone being retouched hides so the preview replaces it
// mid-redraw: everything the zone knows except its shape, parked while you draw
// the new outline. The old outline stays hidden so you're not tracing over it.
let redrawing = null;
const polys = new Map(); // zone id -> its rendered polygon, so search can pop a popup

function placesInZone(z) {
  let pool = allPlaces().filter((p) => pointInPoly(p.lat, p.lng, z.points));
  if (state.curationView) {
    const vis = curationVisibleIds(state.curationView);
    pool = pool.filter((p) => vis.has(p.id));
  }
  return pool;
}

function focusZone(z) {
  map.flyToBounds(L.latLngBounds(z.points), { padding: [60, 60], duration: 0.8 });
}

function filterToZone(z) {
  const inside = placesInZone(z);
  if (!inside.length) { showHint("nothing's inside this zone (yet)", 2200); return; }
  emit("lasso-clear");
  state.zoneFilter = { id: z.id, name: z.name, ids: inside.map((p) => p.id) };
  focusZone(z);
  emit("open-sidebar");
  emit("refresh-list");
}

// what you're about to stake, marching ants and all — restyles live with the pickers
function paintPreview() {
  preview?.remove();
  preview = null;
  if (!pendingPoints) return;
  const pattern = pickedFill === "dots" ? "zfill-dots" : pickedFill === "hatch" ? "zfill-hatch" : null;
  preview = L.polygon(chaikin(pendingPoints, 2, true), {
    color: pickedColor, weight: 3, dashArray: "12 8", fillColor: pickedColor,
    fillOpacity: pattern ? 0.6 : 0.13, className: "rough-line zone-preview", interactive: false,
  }).addTo(map);
  if (pattern && preview._path) {
    preview._path.classList.add(pattern);
    preview._path.style.color = pickedColor;
  }
}

function clearPreview() {
  preview?.remove();
  preview = null;
  pendingPoints = null;
  editingZone = null;
  redrawing = null;
  if (previewSkipId) { previewSkipId = null; renderZones(); }
}

// Zones carry full rants now, so the popup has to live inside the band the chrome
// actually leaves it and scroll the overflow instead of opening under the omnibar
// or behind the list. Measured, not guessed: the sidebar is a right rail on desktop
// and a bottom sheet on mobile, and the sheet's height moves as you drag it.
function popupFit() {
  const wide = window.innerWidth > 940;
  const rect = (sel) => $(sel)?.getBoundingClientRect();
  const sb = rect("#sidebar");
  const top = Math.round(rect("#regionChips")?.bottom || 90) + 14;
  const bottom = wide || !sb ? 40 : Math.round(window.innerHeight - sb.top) + 14;
  const right = wide && sb ? Math.round(window.innerWidth - sb.left) + 14 : 16;
  return {
    maxWidth: 300,
    // ~44px of popup chrome (padding, border, close button) rides on top of this
    maxHeight: Math.max(140, window.innerHeight - top - bottom - 44),
    autoPanPaddingTopLeft: L.point(wide ? 70 : 16, top),
    autoPanPaddingBottomRight: L.point(right, bottom),
  };
}
const refit = (layer) => Object.assign(layer.getPopup().options, popupFit());

function drawZone(z) {
  if (zoneHidden(z.id) || z.id === previewSkipId) return;
  // outlines render smoothed (closed Chaikin) — saved points stay lean.
  // avoid zones = tourist-trap warnings: caution dashes + forced scribble
  // hatch + a crossed-out label, so "skip this" never reads like "go here"
  const avoid = !!z.avoid;
  const pattern = avoid ? "zfill-avoid" : z.fill === "dots" ? "zfill-dots" : z.fill === "hatch" ? "zfill-hatch" : null;
  const poly = L.polygon(chaikin(z.points, 2, true), {
    color: z.color, weight: avoid ? 2.5 : 3, dashArray: avoid ? "4 7" : "12 8", fillColor: z.color,
    fillOpacity: pattern ? 0.6 : 0.13, className: "rough-line",
  }).addTo(zoneLayer);
  if (pattern && poly._path) {
    poly._path.classList.add(pattern);
    poly._path.style.color = z.color; // patterns paint with currentColor
  }
  const c = labelPoint(z.points); // interior point, not vertex average — labels stay inside banana zones
  const label = L.marker(c, {
    icon: L.divIcon({
      className: "zone-label-wrap",
      html: `<span class="zone-label${avoid ? " zone-label-avoid" : ""}" style="--z:${z.color}">${avoid ? '<b class="zone-skip">skip</b>' : ""}${esc(z.name)}${z.star ? ' <span class="zone-star">★</span>' : ""}</span>`,
      iconSize: null,
    }),
    interactive: true,
  }).addTo(zoneLayer);

  // Leaflet reads popup sizing at open time, and the band it has to fit moves
  // (rotate the phone, drag the sheet), so re-measure on the way in rather than
  // freezing it at bind time. The click handler is registered before bindPopup so
  // it runs ahead of Leaflet's own click→open; every other way in calls refit too.
  poly.on("click", () => refit(poly));
  poly.bindPopup(L.popup(popupFit()).setContent(zonePopup(z)));
  label.on("click", () => { refit(poly); poly.openPopup(c); });
  polys.set(z.id, poly);
}

// same shape as pins.js popupContent: build the node, wire it, hand it back
function zonePopup(z) {
  const inside = placesInZone(z).length;
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="popup-title">${esc(z.name)}${z.star ? " ⭐" : ""}</div>
    <div class="popup-blurb">${esc(z.blurb) || "<i>a zone of unspecified vibes</i>"}</div>
    ${z.notes ? `<div class="popup-notes">${linkify(esc(z.notes))}</div>` : ""}
    <div class="popup-links">
      <span class="popup-link zone-filter-link">${inside ? `${inside} rec${inside === 1 ? "" : "s"} inside — show them` : "no recs inside (yet)"}</span>
      ${z.custom ? '<span class="popup-link zone-redraw-link">redraw the outline</span><span class="popup-link zone-edit-link">rename / recolor</span><span class="popup-link zone-del-link">remove this zone</span>' : ""}
    </div>`;
  const wire = (sel, fn) => div.querySelector(sel)?.addEventListener("click", fn);
  if (inside) wire(".zone-filter-link", () => { map.closePopup(); filterToZone(z); });
  wire(".zone-redraw-link", () => { map.closePopup(); startRedraw(z); });
  wire(".zone-edit-link", () => { map.closePopup(); openZoneModal(z.points, z); });
  wire(".zone-del-link", (e) => {
    if (!armCheck(e.target, "un-stake it?")) return;
    removeZone(z.id);
    if (state.zoneFilter?.id === z.id) { state.zoneFilter = null; emit("refresh-list"); }
    map.closePopup();
    renderZones();
  });
  return div;
}

function renderZones() {
  zoneLayer.clearLayers();
  polys.clear();
  allZones().forEach(drawZone);
}

// omnisearch hit → fly there and pop the label open, so the rant is one tap away
let pendingFocus = null;
function focusAndOpen(id) {
  const z = allZones().find((x) => x.id === id);
  if (!z) return;
  if (!state.zonesOn) toggleZones();
  if (zoneHidden(z.id)) { toggleZoneHidden(z.id); renderZones(); }
  focusZone(z);
  // moveend can be skipped when the view already matches, and a second search
  // mid-flight would otherwise pop the first zone — so latest wins, with a floor
  pendingFocus = id;
  const open = () => {
    if (pendingFocus !== id) return;
    pendingFocus = null;
    map.off("moveend", open);
    const poly = polys.get(id);
    if (!poly) return;
    refit(poly);
    poly.openPopup(labelPoint(z.points));
  };
  map.once("moveend", open);
  setTimeout(open, 1200);
}

// ---------- naming modal (create + edit, also fed by lasso→zone) ----------
// freehand points are dense and jittery — thin them to something a human would draw
function tidy(points) {
  const raw = points.map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]);
  const thinned = simplifyPts(raw, 1.8 * degPerPx(map.getZoom()));
  return thinned.length < 4 ? raw : thinned;
}

function paintStar() {
  const b = $("#zoneStar");
  b.classList.toggle("active", pickedStar);
  b.setAttribute("aria-pressed", String(pickedStar));
}

export function openZoneModal(points, existing = null) {
  editingZone = existing;
  if (existing) {
    pendingPoints = existing.points;
    pickedColor = existing.color;
    pickedFill = existing.fill || "solid";
    pickedStar = !!existing.star;
  } else {
    pendingPoints = tidy(points);
    pickedColor = ZONE_COLORS[zoneCount() % ZONE_COLORS.length];
    pickedFill = "solid";
    pickedStar = false;
  }
  $("#zoneModal h2").textContent = existing ? "RETOUCH THE ZONE" : "STAKE OUT A ZONE";
  $("#zoneSave").textContent = existing ? "save the touch-up" : "stake the claim";
  $("#zoneName").value = existing?.name || "";
  $("#zoneBlurb").value = existing?.blurb || "";
  $("#zoneNotes").value = existing?.notes || "";
  // an outline you can't change is the whole complaint — offer it right here
  $("#zoneRedraw").classList.toggle("hidden", !existing);
  [...$("#zoneColors").children].forEach((s) => s.classList.toggle("active", s.dataset.color === pickedColor));
  [...$("#zoneFills").children].forEach((b) => b.classList.toggle("active", b.dataset.fill === pickedFill));
  paintStar();
  previewSkipId = existing?.id || null;
  if (previewSkipId) renderZones(); // the preview stands in for the original
  paintPreview();
  // the modal docks right (bottom on mobile) — pan the goods into the open half
  map.fitBounds(L.latLngBounds(pendingPoints), window.innerWidth > 940
    ? { paddingTopLeft: [50, 80], paddingBottomRight: [500, 50] }
    : { paddingTopLeft: [20, 90], paddingBottomRight: [20, Math.round(window.innerHeight * 0.55)] });
  $("#zoneModal").classList.remove("hidden");
  $("#zoneName").focus();
}

// Every zone field the modal owns. Anything NOT in here (avoid, group, …) is
// carried through a retouch untouched instead of being silently dropped.
const FORM_KEYS = ["name", "blurb", "notes", "color", "fill", "star"];
const modalOpen = () => !$("#zoneModal").classList.contains("hidden");

// what the form holds right now, shaped like a zone — empty text is left out
// entirely so a saved zone reads like the hand-written ones in build-data.mjs
function formValues() {
  const text = (sel) => $(sel).value.trim();
  return {
    name: text("#zoneName"),
    ...(text("#zoneBlurb") ? { blurb: text("#zoneBlurb") } : {}),
    ...(text("#zoneNotes") ? { notes: text("#zoneNotes") } : {}),
    color: pickedColor,
    ...(pickedFill !== "solid" ? { fill: pickedFill } : {}),
    ...(pickedStar ? { star: true } : {}),
  };
}

// ---------- redraw the outline (keeps everything but the shape) ----------
// The modal is stashed, not cancelled: whatever you've typed rides along and you
// land back in it with the new outline previewed, so nothing is retyped.
function startRedraw(z) {
  // reached from the open modal → unsaved edits win; from a popup/drawer row →
  // the zone as stored. Form-owned keys drop off first so clearing one sticks.
  if (modalOpen() && editingZone?.id === z.id) {
    const carried = { ...z };
    for (const k of FORM_KEYS) delete carried[k];
    redrawing = { ...carried, ...formValues() };
  } else {
    redrawing = z;
  }
  $("#zoneModal").classList.add("hidden");
  preview?.remove();
  preview = null;
  pendingPoints = null;
  editingZone = null;
  previewSkipId = z.id; // the old shape steps aside so you're not tracing over it
  renderZones();
  if (!state.zonesOn) toggleZones();
  setMode("zone");
  showHint(`redrawing "${z.name}" — circle the new area, the name and colors stick`, 3200);
}

function cancelRedraw() {
  if (!redrawing) return;
  redrawing = null;
  previewSkipId = null;
  renderZones();
}

function saveZone() {
  const vals = formValues();
  if (!vals.name) { $("#zoneName").focus(); return; }
  // start from the zone being edited so fields the form doesn't own survive:
  // `avoid` (a retouch never launders a trap into a rec) and `group` (what keeps
  // a region chip framing a pinless zone). custom/pack are render flags, not data.
  const carried = { ...editingZone };
  for (const k of [...FORM_KEYS, "custom", "pack", "points", "id"]) delete carried[k];
  const z = {
    id: editingZone ? editingZone.id : "zone-" + Date.now().toString(36),
    ...carried,
    ...vals,
    points: pendingPoints,
  };
  const wasEdit = !!editingZone;
  if (wasEdit) updateZone(z); else addZone(z);
  clearPreview(); // also re-renders when a retouch was hiding the original
  renderZones();
  $("#zoneModal").classList.add("hidden");
  if (state.mode === "zone") setMode(null);
  emit("zone-saved");
  showHint(wasEdit ? `"${name}" — touched up` : `"${name}" is now officially a zone`, 2500);
}

// ---------- zone control drawer ----------
function zoneRow(z) {
  const row = document.createElement("div");
  row.className = "cur-row zone-row";
  const inside = placesInZone(z).length;
  const hidden = zoneHidden(z.id);
  row.innerHTML = `
    <div class="cur-row-head">
      <span class="zone-dot" style="--z:${z.color}"></span>
      <span class="cur-row-name">${esc(z.name)}</span>
      <span class="cur-row-stats">${z.star ? "banger · " : ""}${z.avoid ? "skip-it zone · " : ""}${inside} rec${inside === 1 ? "" : "s"} inside${z.pack ? " · pack zone" : ""}${hidden ? " · hidden" : ""}</span>
    </div>
    ${z.blurb ? `<div class="cur-row-msg">"${esc(z.blurb)}"</div>` : ""}
    <div class="cur-row-actions">
      <button data-act="jump">jump to it</button>
      <button data-act="filter" ${inside ? "" : "disabled"}>show the recs</button>
      <button data-act="hide">${hidden ? "unhide" : "hide"}</button>
      ${z.custom ? '<button data-act="redraw">redraw</button><button data-act="edit">retouch</button><button data-act="del">un-stake</button>' : ""}
    </div>`;
  row.querySelector('[data-act="jump"]').onclick = () => {
    $("#zonesDrawer").classList.add("hidden");
    focusZone(z);
  };
  row.querySelector('[data-act="filter"]').onclick = () => {
    $("#zonesDrawer").classList.add("hidden");
    filterToZone(z);
  };
  row.querySelector('[data-act="hide"]').onclick = () => {
    toggleZoneHidden(z.id);
    renderZones();
    openZonesDrawer();
  };
  const redraw = row.querySelector('[data-act="redraw"]');
  if (redraw) redraw.onclick = () => {
    $("#zonesDrawer").classList.add("hidden");
    startRedraw(z);
  };
  const edit = row.querySelector('[data-act="edit"]');
  if (edit) edit.onclick = () => {
    $("#zonesDrawer").classList.add("hidden");
    openZoneModal(z.points, z);
  };
  const del = row.querySelector('[data-act="del"]');
  if (del) del.onclick = (e) => {
    if (!armCheck(e.target, "un-stake it?")) return;
    removeZone(z.id);
    if (state.zoneFilter?.id === z.id) { state.zoneFilter = null; emit("refresh-list"); }
    renderZones();
    openZonesDrawer();
  };
  return row;
}

function openZonesDrawer() {
  const body = $("#zonesBody");
  body.innerHTML = "";
  const zones = allZones();
  if (!zones.length) {
    body.innerHTML = '<div class="empty-state"><span class="big">🎿</span>no zones staked yet —<br>circle somewhere with vibes</div>';
  } else {
    for (const z of zones) body.append(zoneRow(z));
  }
  $("#zonesDrawer").classList.remove("hidden");
}

// ---------- zones flyout menu ----------
function toggleMenu() {
  const menu = $("#zoneMenu");
  if (!menu.classList.contains("hidden")) { menu.classList.add("hidden"); return; }
  const btn = $('[data-tool="zones"]');
  const r = btn.getBoundingClientRect();
  if (window.innerWidth > 940) {
    menu.style.left = `${r.right + 10}px`;
    menu.style.top = `${r.top}px`;
  } else {
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 8}px`;
  }
  $("#zoneToggle").textContent = state.zonesOn ? "hide zones" : "show zones";
  menu.classList.remove("hidden");
}

function toggleZones() {
  state.zonesOn = !state.zonesOn;
  $('[data-tool="zones"]').classList.toggle("active", state.zonesOn);
  if (state.zonesOn) zoneLayer.addTo(map); else zoneLayer.remove();
}

export function initZones() {
  renderZones();
  on("pack-changed", renderZones);
  on("zone-filter-clear", () => { state.zoneFilter = null; emit("refresh-list"); });
  // bailing out of zone mode mid-redraw (Esc, tool toggle) puts the old shape back
  on("mode-changed", (m) => { if (m !== "zone") cancelRedraw(); });
  on("zone-focus", ({ id }) => focusAndOpen(id));

  // color swatches in the modal
  const wrap = $("#zoneColors");
  for (const c of ZONE_COLORS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.dataset.color = c;
    b.style.setProperty("--c", c);
    b.onclick = () => {
      pickedColor = c;
      [...wrap.children].forEach((s) => s.classList.toggle("active", s === b));
      paintPreview();
    };
    wrap.append(b);
  }

  // fill style picker
  $("#zoneFills").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fill]");
    if (!b) return;
    pickedFill = b.dataset.fill;
    [...$("#zoneFills").children].forEach((x) => x.classList.toggle("active", x === b));
    paintPreview();
  });

  registerSketchMode("zone", {
    style: () => ({ color: "#1d1d24", weight: 3, dashArray: "10 8", lineCap: "round", lineJoin: "round" }),
    onDone(pts) {
      if (pts.length < 5) {
        showHint(redrawing ? "that was barely a squiggle — circle the whole area again" : "that was barely a squiggle — circle the whole area", 2200);
        return; // a dud stroke doesn't cancel a redraw, just try again
      }
      const points = tidy(pts.map((ll) => [ll.lat, ll.lng]));
      if (redrawing) {
        const z = { ...redrawing, points };
        redrawing = null;
        openZoneModal(points, z); // previewSkipId still hides the old shape
        return;
      }
      openZoneModal(pts.map((ll) => [ll.lat, ll.lng]));
    },
  });

  on("zones-menu", toggleMenu);
  $("#zoneDraw").addEventListener("click", () => {
    $("#zoneMenu").classList.add("hidden");
    if (!state.zonesOn) toggleZones(); // drawing implies you want to see them
    setMode("zone");
  });
  $("#zoneManage").addEventListener("click", () => {
    $("#zoneMenu").classList.add("hidden");
    openZonesDrawer();
  });
  $("#zonesClose").addEventListener("click", () => $("#zonesDrawer").classList.add("hidden"));
  $("#zonesNew").addEventListener("click", () => {
    $("#zonesDrawer").classList.add("hidden");
    if (!state.zonesOn) toggleZones();
    setMode("zone");
  });
  $("#zoneToggle").addEventListener("click", () => {
    toggleZones();
    $("#zoneMenu").classList.add("hidden");
  });
  $("#zoneStar").addEventListener("click", () => { pickedStar = !pickedStar; paintStar(); });
  $("#zoneRedraw").addEventListener("click", () => { if (editingZone) startRedraw(editingZone); });
  $("#zoneSave").addEventListener("click", saveZone);
  $("#zoneCancel").addEventListener("click", () => {
    $("#zoneModal").classList.add("hidden");
    clearPreview();
    if (state.mode === "zone") setMode(null);
  });
  // modes.js hides the modal on Escape without asking us — clean up the preview too
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && preview) clearPreview();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#zoneMenu") && !e.target.closest('[data-tool="zones"]')) $("#zoneMenu").classList.add("hidden");
  });
}
