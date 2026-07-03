// Add a new rec by clicking the map.
import { $, CATS, showHint } from "./config.js";
import { map } from "./map.js";
import { state, BASE, addPlace } from "./store.js";
import { emit } from "./bus.js";
import { setMode } from "./modes.js";

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

export function initAddSpot() {
  buildCatPick();

  map.on("click", (e) => {
    if (state.mode !== "add") return;
    pendingLatLng = e.latlng;
    $("#addName").value = "";
    $("#addNotes").value = "";
    $("#addStar").checked = false;
    $("#addModal").classList.remove("hidden");
    $("#addName").focus();
  });

  $("#addCancel").addEventListener("click", () => { $("#addModal").classList.add("hidden"); setMode(null); });

  $("#addSave").addEventListener("click", () => {
    const name = $("#addName").value.trim();
    if (!name) { $("#addName").focus(); return; }
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
    setMode(null);
    emit("refresh");
    emit("place-selected", { id: place.id, fly: false });
    showHint(`📍 "${name}" is on the map — export 💾 to make it permanent`, 3500);
  });
}
