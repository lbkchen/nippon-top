// Distances from a point: GPS ("find me") or any searched spot ("my hotel").
import { $, showHint } from "./config.js";
import { map } from "./map.js";
import { state } from "./store.js";
import { emit, on } from "./bus.js";

let layers = [];

function clearRef() {
  layers.forEach((l) => l.remove());
  layers = [];
  state.userLoc = null;
  $('[data-tool="locate"]').classList.remove("active");
  emit("refresh-list");
}

function setRef(ll, label, accuracy) {
  clearRef();
  state.userLoc = ll;
  if (accuracy) layers.push(L.circle(ll, { radius: accuracy, color: "#4263eb", weight: 1.5, fillOpacity: 0.08 }).addTo(map));
  const icon = L.divIcon({ className: "seek-wrap", html: '<div class="ref-pin"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  const m = L.marker(ll, { icon, zIndexOffset: 900 }).addTo(map);
  m.bindTooltip(label, { className: "nippon-tip", direction: "top", offset: [0, -10] });
  layers.push(m);
  $('[data-tool="locate"]').classList.add("active");
  map.flyTo(ll, Math.max(map.getZoom(), 13), { duration: 1 });
  showHint(`distances now measured from ${label} — nearest first`, 3500);
  emit("refresh-list");
}

function locate() {
  if (state.userLoc) { clearRef(); showHint("distance mode off", 1500); return; } // toggle
  if (!navigator.geolocation) { showHint("this browser keeps your location a secret", 3000); return; }
  showHint("triangulating…");
  navigator.geolocation.getCurrentPosition(
    (pos) => setRef([pos.coords.latitude, pos.coords.longitude], "you", pos.coords.accuracy),
    () => showHint("no luck — location denied or unavailable", 3000),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

export function initLocate() {
  on("locate", locate);
  on("set-ref-loc", ({ ll, label }) => setRef(ll, label));
}
