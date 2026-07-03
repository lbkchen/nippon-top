// "find me" — for standing in Shinjuku wondering where ken would eat.
import { $, showHint } from "./config.js";
import { map } from "./map.js";
import { state } from "./store.js";
import { emit, on } from "./bus.js";

let dot = null, ring = null;

function clearDot() {
  if (dot) { dot.remove(); dot = null; }
  if (ring) { ring.remove(); ring = null; }
  state.userLoc = null;
  $('[data-tool="locate"]').classList.remove("active");
  emit("refresh-list");
}

function locate() {
  if (state.userLoc) { clearDot(); return; } // toggle off
  if (!navigator.geolocation) { showHint("🧭 this browser keeps your location a secret", 3000); return; }
  showHint("🧭 triangulating…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      state.userLoc = ll;
      ring = L.circle(ll, { radius: pos.coords.accuracy, color: "#4263eb", weight: 1.5, fillOpacity: 0.08 }).addTo(map);
      dot = L.circleMarker(ll, { radius: 8, color: "#fffdf7", weight: 3, fillColor: "#4263eb", fillOpacity: 1 }).addTo(map);
      $('[data-tool="locate"]').classList.add("active");
      map.flyTo(ll, Math.max(map.getZoom(), 13), { duration: 1 });
      showHint("🧭 you are the blue dot — cards now show how far the food is", 3500);
      emit("refresh-list");
    },
    () => showHint("🧭 no luck — location denied or unavailable", 3000),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

export const initLocate = () => on("locate", locate);
