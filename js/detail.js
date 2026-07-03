// Spot detail: the sidebar drills into one place — photo, the whole rant,
// which zone it's in, and the nearest other recs to chain onto.
import { $, esc, linkify, CATS, distKm, fmtDist, gmapsUrl, pointInPoly } from "./config.js";
import { map } from "./map.js";
import { state, placeById, allPlaces, allZones, isCustom, deletePlace, placePassesFilters } from "./store.js";
import { emit, on } from "./bus.js";

function nearestTo(p, n = 3) {
  return allPlaces()
    .filter((o) => o.id !== p.id && placePassesFilters(o))
    .map((o) => ({ o, d: distKm([p.lat, p.lng], [o.lat, o.lng]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

function render(id) {
  const p = placeById(id);
  if (!p) return close();
  const cat = CATS[p.cat] || CATS.fun;
  const zone = allZones().find((z) => pointInPoly(p.lat, p.lng, z.points));
  const viewNote = state.curationView?.notes?.[p.id];
  const panel = $("#detailPanel");
  panel.innerHTML = `
    <button class="detail-back">← back to the list</button>
    ${p.photo ? `<figure class="detail-photo"><img src="img/${esc(p.photo)}" alt="${esc(p.name)}" /></figure>` : ""}
    <div class="detail-head">
      <span class="detail-emoji">${p.emoji || cat.emoji}</span>
      <h2 class="detail-name">${esc(p.name)}${p.star ? ' <span class="card-star">★</span>' : ""}</h2>
    </div>
    ${p.star ? '<span class="banger-ribbon detail-ribbon">CERTIFIED BANGER</span>' : ""}
    <div class="card-pills">
      <span class="pill cat-pill" style="--pin:${cat.color}">${cat.label}</span>
      <span class="pill">${esc(p.region)}</span>
      ${p.approx ? '<span class="pill approx" title="pin placed from memory">~ish location</span>' : ""}
      ${isCustom(p.id) ? '<span class="pill custom">hand-added</span>' : ""}
      ${state.userLoc ? `<span class="pill dist">${fmtDist(distKm(state.userLoc, [p.lat, p.lng]))} from you</span>` : ""}
    </div>
    ${viewNote ? `<div class="card-personal">for ${esc(state.curationView.name)}: ${esc(viewNote)}</div>` : ""}
    <div class="detail-notes">${linkify(esc(p.notes)) || '<i>no notes yet — a rec so good it speaks for itself (or ken got lazy)</i>'}</div>
    <a class="btn-solid detail-gmaps" href="${gmapsUrl(p)}" target="_blank" rel="noopener">open in google maps ↗</a>
    ${zone ? `<div class="detail-zone"><span class="zone-dot" style="--z:${zone.color}"></span>inside ${esc(zone.name)}</div>` : ""}
    <div class="omni-section detail-section">pairs well with</div>
    <div class="detail-pairs"></div>
    ${isCustom(p.id) ? '<button class="detail-del">delete this spot</button>' : ""}`;

  const img = panel.querySelector(".detail-photo img");
  if (img) img.addEventListener("error", () => panel.querySelector(".detail-photo").remove());

  const pairs = panel.querySelector(".detail-pairs");
  const near = nearestTo(p);
  if (!near.length) pairs.innerHTML = '<div class="geo-empty">nothing else nearby (yet)</div>';
  for (const { o, d } of near) {
    const b = document.createElement("button");
    b.className = "pair";
    b.innerHTML = `<span>${o.emoji || (CATS[o.cat] || CATS.fun).emoji} ${esc(o.name)}${o.star ? ' <span class="omni-star">★</span>' : ""}</span>
      <span class="pair-d">${fmtDist(d)} away</span>`;
    b.addEventListener("click", () => open({ id: o.id, fly: true }));
    pairs.append(b);
  }

  panel.querySelector(".detail-back").addEventListener("click", close);
  const del = panel.querySelector(".detail-del");
  if (del) del.addEventListener("click", () => {
    if (!confirm(`delete "${p.name}"? it never happened.`)) return;
    deletePlace(p.id);
    emit("place-removed", { id: p.id });
    emit("refresh");
    close();
  });
}

function open({ id, fly = false }) {
  state.detailId = id;
  render(id);
  $("#cards").classList.add("hidden");
  $("#detailPanel").classList.remove("hidden");
  $("#detailPanel").scrollTop = 0;
  emit("open-sidebar");
  const p = placeById(id);
  if (fly && p) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
}

function close() {
  if (state.detailId === null) return;
  const last = state.detailId;
  state.detailId = null;
  $("#detailPanel").classList.add("hidden");
  $("#cards").classList.remove("hidden");
  emit("refresh-list");
  emit("place-selected", { id: last, fly: false });
}

export function initDetail() {
  on("open-detail", open);
  on("close-detail", close);
  on("mode-changed", (m) => { if (m) close(); }); // picking up a tool returns you to the list
}
