// The primary search bar: recs and real-world places in one dropdown.
// Typing live-filters the map; picking a rec flies to it; picking an
// address drops a marker with "add a spot here" / "distances from here".
import { $, esc, CATS, showHint } from "./config.js";
import { map } from "./map.js";
import { state, allPlaces } from "./store.js";
import { emit, on } from "./bus.js";
import { photonSearch, debounce } from "./photon.js";

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

function recMatches(q) {
  return allPlaces()
    .filter((p) => `${p.name} ${p.notes} ${p.region}`.toLowerCase().includes(q))
    .sort((a, b) => (b.star - a.star) || a.name.localeCompare(b.name))
    .slice(0, 5);
}

export function initOmnisearch() {
  const input = $("#omniInput");
  const results = $("#omniResults");
  const clearBtn = $("#omniClear");
  let latest = 0;
  let placeSection = null; // live node for the async photon section

  const close = () => results.classList.add("hidden");

  function pickRec(p) {
    input.value = p.name;
    state.q = ""; // navigating beats filtering
    clearBtn.classList.remove("hidden");
    close();
    emit("refresh");
    emit("open-detail", { id: p.id, fly: true });
  }

  function pickPlace(r) {
    input.value = r.name;
    state.q = ""; // show all recs around the found place
    clearBtn.classList.remove("hidden");
    close();
    emit("refresh");
    dropSeek(r);
  }

  function render(q) {
    results.innerHTML = "";
    const recs = recMatches(q);
    if (recs.length) {
      const title = document.createElement("div");
      title.className = "omni-section";
      title.textContent = "in the recs";
      results.append(title);
      for (const p of recs) {
        const cat = CATS[p.cat] || CATS.fun;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "geo-result";
        b.innerHTML = `<span class="geo-name">${p.emoji || cat.emoji} ${esc(p.name)}${p.star ? ' <span class="omni-star">★</span>' : ""}</span><span class="geo-where">${esc(p.region)} · ${cat.label}</span>`;
        b.addEventListener("click", () => pickRec(p));
        results.append(b);
      }
    }
    placeSection = document.createElement("div");
    if (q.length >= 3) {
      const title = document.createElement("div");
      title.className = "omni-section";
      title.textContent = "on the map";
      results.append(title, placeSection);
      placeSection.innerHTML = '<div class="geo-empty">searching…</div>';
    } else if (!recs.length) {
      placeSection.innerHTML = '<div class="geo-empty">keep typing to search addresses…</div>';
      results.append(placeSection);
    }
    results.classList.remove("hidden");
  }

  const searchPlaces = debounce(async (q) => {
    if (q.length < 3) return;
    const ticket = ++latest;
    try {
      const c = map.getCenter();
      const found = await photonSearch(q, [c.lat, c.lng]);
      if (ticket !== latest || !placeSection) return;
      placeSection.innerHTML = "";
      if (!found.length) {
        placeSection.innerHTML = '<div class="geo-empty">nothing found — try fewer words</div>';
        return;
      }
      for (const r of found.slice(0, 5)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "geo-result";
        b.innerHTML = `<span class="geo-name"></span><span class="geo-where"></span>`;
        b.querySelector(".geo-name").textContent = r.name;
        b.querySelector(".geo-where").textContent = r.where;
        b.addEventListener("click", () => pickPlace(r));
        placeSection.append(b);
      }
    } catch {
      if (ticket === latest && placeSection) placeSection.innerHTML = '<div class="geo-empty">address search is napping — recs still work</div>';
    }
  }, 350);

  input.addEventListener("input", () => {
    const raw = input.value.trim();
    state.q = raw.toLowerCase(); // live-filter pins + list while typing
    clearBtn.classList.toggle("hidden", !raw);
    emit("refresh");
    if (!raw) { close(); return; }
    render(state.q);
    searchPlaces(raw);
  });

  const clearAll = () => {
    input.value = "";
    state.q = "";
    clearBtn.classList.add("hidden");
    close();
    clearSeek();
    emit("refresh");
  };
  clearBtn.addEventListener("click", () => { clearAll(); input.focus(); });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") results.querySelector(".geo-result")?.click();
    if (e.key === "Escape") { close(); input.blur(); }
  });
  input.addEventListener("focus", () => { if (input.value.trim() && state.q) render(state.q); });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".omnibar")) close();
  });

  on("clear-seek", clearSeek);
  map.attributionControl.addAttribution("search © <a href='https://photon.komoot.io/'>Photon</a>");
}
