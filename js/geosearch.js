// Find any place/address on the map — then add a spot there, or measure
// distances from it ("what's near my hotel?").
import { $, showHint } from "./config.js";
import { map } from "./map.js";
import { emit, on } from "./bus.js";
import { photonSearch, debounce, renderResults } from "./photon.js";

let seekMarker = null;

function clearSeek() {
  if (seekMarker) { seekMarker.remove(); seekMarker = null; }
}

function dropSeek(r) {
  clearSeek();
  const icon = L.divIcon({
    className: "seek-wrap",
    html: '<div class="seek-pin"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  seekMarker = L.marker([r.lat, r.lng], { icon, zIndexOffset: 900 }).addTo(map);

  const div = document.createElement("div");
  div.innerHTML = `
    <div class="popup-title"></div>
    <div class="popup-blurb"></div>
    <div class="seek-actions">
      <button class="btn-solid" data-act="add">add a spot here</button>
      <button class="btn-ghost" data-act="ref">distances from here</button>
      <button class="btn-ghost" data-act="no">never mind</button>
    </div>`;
  div.querySelector(".popup-title").textContent = r.name;
  div.querySelector(".popup-blurb").textContent = r.where || "";
  div.querySelector('[data-act="add"]').onclick = () => {
    map.closePopup();
    clearSeek();
    emit("add-at", { lat: r.lat, lng: r.lng, name: r.name });
  };
  div.querySelector('[data-act="ref"]').onclick = () => {
    map.closePopup();
    clearSeek();
    emit("set-ref-loc", { ll: [r.lat, r.lng], label: r.name });
  };
  div.querySelector('[data-act="no"]').onclick = () => { map.closePopup(); clearSeek(); };

  seekMarker.bindPopup(div, { offset: [0, -4], maxWidth: 240 }).openPopup();
  map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 15), { duration: 0.9 });
}

export function initGeosearch() {
  const input = $("#geoInput");
  const results = $("#geoResults");
  let latest = 0;

  const search = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 3) { results.classList.add("hidden"); return; }
    const ticket = ++latest;
    try {
      const c = map.getCenter();
      const found = await photonSearch(q, [c.lat, c.lng]);
      if (ticket !== latest) return; // a newer query is in flight
      renderResults(results, found, (r) => {
        results.classList.add("hidden");
        input.value = r.name;
        dropSeek(r);
      });
    } catch {
      if (ticket === latest) showHint("the address search is napping — try again in a sec", 2500);
    }
  }, 350);

  input.addEventListener("input", search);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") results.querySelector(".geo-result")?.click();
    if (e.key === "Escape") { results.classList.add("hidden"); input.blur(); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".geo-search")) results.classList.add("hidden");
  });

  on("clear-seek", clearSeek);
  map.attributionControl.addAttribution("search © <a href='https://photon.komoot.io/'>Photon</a>");
}
