// Ski-map style vibe zones: colored areas with label stickers.
// Draw one via the zones menu (freehand) or save a lasso as a zone —
// both land in the same naming modal.
import { $, esc, showHint, labelPoint, simplifyPts, chaikin, degPerPx, ZONE_COLORS } from "./config.js";
import { map, zoneLayer } from "./map.js";
import { state, allZones, addZone, removeZone, zoneCount } from "./store.js";
import { emit, on } from "./bus.js";
import { setMode } from "./modes.js";
import { registerSketchMode } from "./sketch.js";

let pendingPoints = null;
let pickedColor = ZONE_COLORS[0];

function drawZone(z) {
  // outlines render smoothed (closed Chaikin) — saved points stay lean
  const poly = L.polygon(chaikin(z.points, 2, true), {
    color: z.color, weight: 3, dashArray: "12 8", fillColor: z.color, fillOpacity: 0.13, className: "rough-line",
  }).addTo(zoneLayer);
  const c = labelPoint(z.points); // interior point, not vertex average — labels stay inside banana zones
  const label = L.marker(c, {
    icon: L.divIcon({ className: "zone-label-wrap", html: `<span class="zone-label" style="--z:${z.color}">${esc(z.name)}</span>`, iconSize: null }),
    interactive: true,
  }).addTo(zoneLayer);
  const div = document.createElement("div");
  div.innerHTML = `<div class="popup-title">${esc(z.name)}</div><div class="popup-blurb">${esc(z.blurb) || "<i>a zone of unspecified vibes</i>"}</div>
    ${z.custom ? '<span class="popup-link">remove this zone</span>' : ""}`;
  const del = div.querySelector(".popup-link");
  if (del) del.addEventListener("click", () => {
    removeZone(z.id);
    zoneLayer.removeLayer(poly);
    zoneLayer.removeLayer(label);
    map.closePopup();
  });
  poly.bindPopup(div);
  label.on("click", () => poly.openPopup(c));
}

// ---------- naming modal (shared by draw-a-zone and lasso→zone) ----------
export function openZoneModal(points) {
  const tol = 1.8 * degPerPx(map.getZoom());
  pendingPoints = simplifyPts(points.map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]), tol);
  if (pendingPoints.length < 4) pendingPoints = points.map((p) => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]);
  pickedColor = ZONE_COLORS[zoneCount() % ZONE_COLORS.length];
  $("#zoneName").value = "";
  $("#zoneBlurb").value = "";
  [...$("#zoneColors").children].forEach((s) => s.classList.toggle("active", s.dataset.color === pickedColor));
  $("#zoneModal").classList.remove("hidden");
  $("#zoneName").focus();
}

function saveZone() {
  const name = $("#zoneName").value.trim();
  if (!name) { $("#zoneName").focus(); return; }
  const z = {
    id: "zone-" + Date.now().toString(36),
    name,
    blurb: $("#zoneBlurb").value.trim(),
    color: pickedColor,
    points: pendingPoints,
  };
  addZone(z);
  drawZone({ ...z, custom: true });
  $("#zoneModal").classList.add("hidden");
  pendingPoints = null;
  if (state.mode === "zone") setMode(null);
  emit("zone-saved");
  showHint(`"${name}" is now officially a zone`, 2500);
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

// full relayer — cheap enough, and the only sane way to add/remove pack zones
function renderZones() {
  zoneLayer.clearLayers();
  allZones().forEach(drawZone);
}

export function initZones() {
  renderZones();
  on("pack-changed", renderZones);

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
  $("#zoneToggle").addEventListener("click", () => {
    toggleZones();
    $("#zoneMenu").classList.add("hidden");
  });
  $("#zoneSave").addEventListener("click", saveZone);
  $("#zoneCancel").addEventListener("click", () => {
    $("#zoneModal").classList.add("hidden");
    pendingPoints = null;
    if (state.mode === "zone") setMode(null);
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#zoneMenu") && !e.target.closest('[data-tool="zones"]')) $("#zoneMenu").classList.add("hidden");
  });
}
