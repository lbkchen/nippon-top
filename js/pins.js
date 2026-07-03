// Markers: sticker pins, popups, visibility, selection flights.
import { CATS, esc, linkify, jitter } from "./config.js";
import { map } from "./map.js";
import { state, allPlaces, placePassesFilters, placeById, isCustom, curationVisibleIds } from "./store.js";
import { emit, on } from "./bus.js";

export const markers = {}; // id -> L.marker

function pinIcon(p) {
  const cat = CATS[p.cat] || CATS.fun;
  const size = p.star ? 38 : 30;
  const cls = ["pin", p.star ? "star" : "", p.approx ? "approx" : "", isCustom(p.id) ? "custom-pin" : ""].join(" ");
  const html = `<div class="${cls}" style="--pin:${cat.color};--tilt:${jitter(p.id)}deg">
      <span class="pin-emoji">${p.emoji || cat.emoji}</span>
      ${p.star ? '<span class="pin-badge">⭐</span>' : ""}
      <span class="curate-badge"></span>
    </div>`;
  return L.divIcon({ className: "pin-wrap", html, iconSize: [size, size], iconAnchor: [size / 2, size], tooltipAnchor: [0, -size] });
}

function popupContent(p) {
  const div = document.createElement("div");
  const short = p.notes && p.notes.length > 150 ? p.notes.slice(0, 147) + "…" : p.notes;
  div.innerHTML = `
    <div class="popup-title">${p.emoji || CATS[p.cat].emoji} ${esc(p.name)} ${p.star ? "⭐" : ""}</div>
    <div class="popup-blurb">${linkify(esc(short)) || "<i>no notes, pure vibes</i>"}</div>
    ${p.notes && p.notes.length > 150 ? '<span class="popup-link">read the full rant in the list →</span>' : ""}`;
  const link = div.querySelector(".popup-link");
  if (link) link.addEventListener("click", () => emit("place-selected", { id: p.id, fly: false, openList: true }));
  return div;
}

function makeMarker(p) {
  const m = L.marker([p.lat, p.lng], { icon: pinIcon(p), riseOnHover: true, zIndexOffset: p.star ? 500 : 0 });
  m.bindTooltip(`${p.star ? "⭐ " : ""}${esc(p.name)}`, { className: "nippon-tip", direction: "top" });
  m.bindPopup(() => popupContent(p), { offset: [0, -6], maxWidth: 260 });
  m.on("click", (e) => {
    if (state.mode === "curate") {
      L.DomEvent.stop(e);
      m.closePopup();
      emit("mix-toggle", p.id);
      return;
    }
    emit("place-selected", { id: p.id, fly: false });
  });
  markers[p.id] = m;
  return m;
}

export function refreshMarkers() {
  const viewIds = state.curationView ? curationVisibleIds(state.curationView) : null;
  const editing = state.editingCuration;
  const editVis = editing ? curationVisibleIds(editing) : null;
  for (const p of allPlaces()) {
    const m = markers[p.id] || makeMarker(p);
    const show = placePassesFilters(p);
    if (show && !map.hasLayer(m)) m.addTo(map);
    if (!show && map.hasLayer(m)) m.remove();
    const el = m.getElement();
    if (!el) continue;
    el.classList.toggle("dimmed", !!viewIds && !viewIds.has(p.id));
    const pin = el.querySelector(".pin");
    if (pin) {
      pin.classList.toggle("cur-in", !!editVis && editVis.has(p.id));
      pin.classList.toggle("cur-out", !!editVis && !editVis.has(p.id));
      const badge = pin.querySelector(".curate-badge");
      if (badge) badge.textContent = editVis ? (editVis.has(p.id) ? "💌" : "✕") : "";
    }
  }
}

export function highlightPin(id, on_) {
  const m = markers[id];
  if (m && m.getElement()) {
    const pin = m.getElement().querySelector(".pin");
    if (pin) pin.style.transform = on_ ? "rotate(calc(-45deg + var(--tilt, 0deg))) scale(1.3)" : "";
  }
}

export function initPins() {
  on("refresh", refreshMarkers);
  on("place-selected", ({ id, fly }) => {
    const p = placeById(id);
    if (!p) return;
    if (fly) {
      map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
      setTimeout(() => markers[id] && markers[id].openPopup(), 850);
    }
  });
  on("place-removed", ({ id }) => {
    if (markers[id]) { markers[id].remove(); delete markers[id]; }
  });
  // scale pins down when zoomed way out, so dense clusters stay readable
  const zoomClass = () => {
    const z = map.getZoom();
    document.body.dataset.zoom = z < 9 ? "far" : z < 13 ? "mid" : "near";
  };
  map.on("zoomend", zoomClass);
  zoomClass();
}
