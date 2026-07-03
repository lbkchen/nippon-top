// Add a new rec: search for the place, or click the map.
import { $, CATS, showHint } from "./config.js";
import { map } from "./map.js";
import { state, BASE, addPlace } from "./store.js";
import { emit, on } from "./bus.js";
import { setMode } from "./modes.js";
import { photonSearch, debounce, renderResults } from "./photon.js";

let pendingLatLng = null;
let addCat = "food";

function buildCatPick() {
  const wrap = $("#addCatPick");
  for (const [key, cat] of Object.entries(CATS)) {
    const b = document.createElement("button");
    b.textContent = `${cat.emoji} ${cat.label}`;
    b.dataset.cat = key;
    if (key === addCat) b.classList.add("active");
    b.onclick = () => {
      addCat = key;
      [...wrap.children].forEach((c) => c.classList.toggle("active", c === b));
    };
    wrap.append(b);
  }
}

function pinStatus() {
  const el = $("#addPinStatus");
  el.innerHTML = "";
  if (pendingLatLng) {
    el.textContent = `pinned at ${pendingLatLng.lat.toFixed(5)}, ${pendingLatLng.lng.toFixed(5)} ✓`;
    el.classList.add("ok");
  } else {
    el.classList.remove("ok");
    el.append("no location yet — search above, or ");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "linkish";
    btn.textContent = "click the map instead";
    btn.onclick = () => {
      $("#addModal").classList.add("hidden");
      showHint("click the map right where the new spot goes");
    };
    el.append(btn);
  }
}

function openModal({ latlng = null, name = "" } = {}) {
  pendingLatLng = latlng;
  if (name || !$("#addName").value) $("#addName").value = name;
  $("#addSearchResults").classList.add("hidden");
  pinStatus();
  $("#addModal").classList.remove("hidden");
  (pendingLatLng ? $("#addName") : $("#addSearch")).focus();
}

function resetModal() {
  pendingLatLng = null;
  $("#addName").value = "";
  $("#addNotes").value = "";
  $("#addSearch").value = "";
  $("#addStar").checked = false;
  $("#addSearchResults").classList.add("hidden");
}

export function initAddSpot() {
  buildCatPick();

  // in-modal place search
  const searchInput = $("#addSearch");
  const results = $("#addSearchResults");
  let latest = 0;
  const search = debounce(async () => {
    const q = searchInput.value.trim();
    if (q.length < 3) { results.classList.add("hidden"); return; }
    const ticket = ++latest;
    try {
      const c = map.getCenter();
      const found = await photonSearch(q, [c.lat, c.lng]);
      if (ticket !== latest) return;
      renderResults(results, found, (r) => {
        results.classList.add("hidden");
        pendingLatLng = L.latLng(r.lat, r.lng);
        if (!$("#addName").value.trim()) $("#addName").value = r.name;
        searchInput.value = `${r.name}${r.where ? " — " + r.where : ""}`;
        pinStatus();
      });
    } catch { /* photon napping — the map-click path still works */ }
  }, 350);
  searchInput.addEventListener("input", search);

  // entry points: toolbar (modal first), map click while in add mode, geosearch handoff
  on("mode-changed", (m) => {
    if (m === "add" && $("#addModal").classList.contains("hidden") && !pendingLatLng) openModal();
  });
  map.on("click", (e) => {
    if (state.mode !== "add") return;
    openModal({ latlng: e.latlng });
  });
  on("add-at", ({ lat, lng, name }) => {
    if (state.mode !== "add") setMode("add");
    openModal({ latlng: L.latLng(lat, lng), name });
  });

  $("#addCancel").addEventListener("click", () => {
    $("#addModal").classList.add("hidden");
    resetModal();
    setMode(null);
  });

  $("#addSave").addEventListener("click", () => {
    const name = $("#addName").value.trim();
    if (!name) { $("#addName").focus(); return; }
    if (!pendingLatLng) { $("#addSearch").focus(); return; }
    // inherit region + group from the nearest existing rec
    let best = null, bestD = Infinity;
    for (const p of BASE.places) {
      const d = (p.lat - pendingLatLng.lat) ** 2 + (p.lng - pendingLatLng.lng) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    const place = {
      id: "custom-" + Date.now().toString(36),
      name,
      star: $("#addStar").checked,
      region: best ? best.region : "somewhere in Japan",
      group: best ? best.group : "tokyo",
      cat: addCat,
      emoji: null,
      lat: +pendingLatLng.lat.toFixed(6),
      lng: +pendingLatLng.lng.toFixed(6),
      approx: false,
      notes: $("#addNotes").value.trim(),
    };
    addPlace(place);
    $("#addModal").classList.add("hidden");
    resetModal();
    setMode(null);
    emit("refresh");
    emit("place-selected", { id: place.id, fly: true });
    showHint(`"${name}" is on the map — export to make it permanent`, 3500);
  });
}
