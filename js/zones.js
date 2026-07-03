// Ski-map style vibe zones: colored areas with label stickers.
import { $, esc, showHint, ZONE_COLORS } from "./config.js";
import { map, zoneLayer } from "./map.js";
import { state, allZones, addZone, removeZone, zoneCount } from "./store.js";
import { on } from "./bus.js";

function drawZone(z) {
  const poly = L.polygon(z.points, {
    color: z.color, weight: 3, dashArray: "12 8", fillColor: z.color, fillOpacity: 0.13, className: "rough-line",
  }).addTo(zoneLayer);
  const c = z.points.reduce((a, p) => [a[0] + p[0] / z.points.length, a[1] + p[1] / z.points.length], [0, 0]);
  const label = L.marker(c, {
    icon: L.divIcon({ className: "zone-label-wrap", html: `<span class="zone-label" style="--z:${z.color}">${esc(z.name)}</span>`, iconSize: null }),
    interactive: true,
  }).addTo(zoneLayer);
  const div = document.createElement("div");
  div.innerHTML = `<div class="popup-title">🎿 ${esc(z.name)}</div><div class="popup-blurb">${esc(z.blurb) || "<i>a zone of unspecified vibes</i>"}</div>
    ${z.custom ? '<span class="popup-link">🗑️ remove this zone</span>' : ""}`;
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

// prompt-driven zone creation from lasso points; returns true if saved
export function promptZoneFromPoints(points) {
  const name = prompt("name this zone (ski map style — 'here be tsukemen'):");
  if (!name) return false;
  const blurb = prompt("one-liner about the vibes here (optional):") || "";
  const z = {
    id: "zone-" + Date.now().toString(36),
    name, blurb,
    color: ZONE_COLORS[zoneCount() % ZONE_COLORS.length],
    points: points.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]),
  };
  addZone(z);
  drawZone({ ...z, custom: true });
  showHint(`🎿 "${name}" is now officially a zone`, 2500);
  return true;
}

export function initZones() {
  allZones().forEach(drawZone);
  on("toggle-zones", () => {
    state.zonesOn = !state.zonesOn;
    $('[data-tool="zones"]').classList.toggle("active", state.zonesOn);
    if (state.zonesOn) zoneLayer.addTo(map); else zoneLayer.remove();
  });
}
