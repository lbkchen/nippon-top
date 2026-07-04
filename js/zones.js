// Ski-map style vibe zones: colored areas with label stickers.
// Draw one via the zones menu (freehand) or save a lasso as a zone — both land
// in the same naming modal, which also handles re-editing an existing zone.
// Zones know what's inside them: the popup and drawer can scope the sidebar
// to a zone's recs (lasso-style), and every zone can hide individually.
import { $, esc, showHint, armCheck, labelPoint, pointInPoly, simplifyPts, chaikin, degPerPx, ZONE_COLORS } from "./config.js";
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

function drawZone(z) {
  if (zoneHidden(z.id)) return;
  // outlines render smoothed (closed Chaikin) — saved points stay lean
  const pattern = z.fill === "dots" ? "zfill-dots" : z.fill === "hatch" ? "zfill-hatch" : null;
  const poly = L.polygon(chaikin(z.points, 2, true), {
    color: z.color, weight: 3, dashArray: "12 8", fillColor: z.color,
    fillOpacity: pattern ? 0.6 : 0.13, className: "rough-line",
  }).addTo(zoneLayer);
  if (pattern && poly._path) {
    poly._path.classList.add(pattern);
    poly._path.style.color = z.color; // patterns paint with currentColor
  }
  const c = labelPoint(z.points); // interior point, not vertex average — labels stay inside banana zones
  const label = L.marker(c, {
    icon: L.divIcon({ className: "zone-label-wrap", html: `<span class="zone-label" style="--z:${z.color}">${esc(z.name)}</span>`, iconSize: null }),
    interactive: true,
  }).addTo(zoneLayer);

  const inside = placesInZone(z).length;
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="popup-title">${esc(z.name)}</div>
    <div class="popup-blurb">${esc(z.blurb) || "<i>a zone of unspecified vibes</i>"}</div>
    <span class="popup-link zone-filter-link">${inside ? `${inside} rec${inside === 1 ? "" : "s"} inside — show them` : "no recs inside (yet)"}</span>
    ${z.custom ? '<span class="popup-link zone-edit-link">retouch this zone</span><span class="popup-link zone-del-link">remove this zone</span>' : ""}`;
  if (inside) div.querySelector(".zone-filter-link").addEventListener("click", () => { map.closePopup(); filterToZone(z); });
  const edit = div.querySelector(".zone-edit-link");
  if (edit) edit.addEventListener("click", () => { map.closePopup(); openZoneModal(z.points, z); });
  const del = div.querySelector(".zone-del-link");
  if (del) del.addEventListener("click", (e) => {
    if (!armCheck(e.target, "un-stake it?")) return;
    removeZone(z.id);
    if (state.zoneFilter?.id === z.id) { state.zoneFilter = null; emit("refresh-list"); }
    map.closePopup();
    renderZones();
  });
  poly.bindPopup(div);
  label.on("click", () => poly.openPopup(c));
}

function renderZones() {
  zoneLayer.clearLayers();
  allZones().forEach(drawZone);
}

// ---------- naming modal (create + edit, also fed by lasso→zone) ----------
export function openZoneModal(points, existing = null) {
  editingZone = existing;
  if (existing) {
    pendingPoints = existing.points;
    pickedColor = existing.color;
    pickedFill = existing.fill || "solid";
  } else {
    const tol = 1.8 * degPerPx(map.getZoom());
    pendingPoints = simplifyPts(points.map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]), tol);
    if (pendingPoints.length < 4) pendingPoints = points.map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]);
    pickedColor = ZONE_COLORS[zoneCount() % ZONE_COLORS.length];
    pickedFill = "solid";
  }
  $("#zoneModal h2").textContent = existing ? "RETOUCH THE ZONE" : "STAKE OUT A ZONE";
  $("#zoneSave").textContent = existing ? "save the touch-up" : "stake the claim";
  $("#zoneName").value = existing?.name || "";
  $("#zoneBlurb").value = existing?.blurb || "";
  [...$("#zoneColors").children].forEach((s) => s.classList.toggle("active", s.dataset.color === pickedColor));
  [...$("#zoneFills").children].forEach((b) => b.classList.toggle("active", b.dataset.fill === pickedFill));
  $("#zoneModal").classList.remove("hidden");
  $("#zoneName").focus();
}

function saveZone() {
  const name = $("#zoneName").value.trim();
  if (!name) { $("#zoneName").focus(); return; }
  const z = {
    id: editingZone ? editingZone.id : "zone-" + Date.now().toString(36),
    name,
    blurb: $("#zoneBlurb").value.trim(),
    color: pickedColor,
    ...(pickedFill !== "solid" ? { fill: pickedFill } : {}),
    points: pendingPoints,
  };
  const wasEdit = !!editingZone;
  if (wasEdit) updateZone(z); else addZone(z);
  renderZones();
  $("#zoneModal").classList.add("hidden");
  pendingPoints = null;
  editingZone = null;
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
      <span class="cur-row-stats">${inside} rec${inside === 1 ? "" : "s"} inside${z.pack ? " · pack zone" : ""}${hidden ? " · hidden" : ""}</span>
    </div>
    ${z.blurb ? `<div class="cur-row-msg">"${esc(z.blurb)}"</div>` : ""}
    <div class="cur-row-actions">
      <button data-act="jump">jump to it</button>
      <button data-act="filter" ${inside ? "" : "disabled"}>show the recs</button>
      <button data-act="hide">${hidden ? "unhide" : "hide"}</button>
      ${z.custom ? '<button data-act="edit">retouch</button><button data-act="del">un-stake</button>' : ""}
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
    };
    wrap.append(b);
  }

  // fill style picker
  $("#zoneFills").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fill]");
    if (!b) return;
    pickedFill = b.dataset.fill;
    [...$("#zoneFills").children].forEach((x) => x.classList.toggle("active", x === b));
  });

  registerSketchMode("zone", {
    style: () => ({ color: "#1d1d24", weight: 3, dashArray: "10 8", lineCap: "round", lineJoin: "round" }),
    onDone(pts) {
      if (pts.length < 5) { showHint("that was barely a squiggle — circle the whole area", 2200); return; }
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
  $("#zoneSave").addEventListener("click", saveZone);
  $("#zoneCancel").addEventListener("click", () => {
    $("#zoneModal").classList.add("hidden");
    pendingPoints = null;
    editingZone = null;
    if (state.mode === "zone") setMode(null);
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#zoneMenu") && !e.target.closest('[data-tool="zones"]')) $("#zoneMenu").classList.add("hidden");
  });
}
