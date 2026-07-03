/* ============ NIPPON TOP — the brains ============ */
"use strict";

// ---------- categories ----------
const CATS = {
  food:   { emoji: "🍜", label: "slurps & bites", color: "#e03131" },
  cafe:   { emoji: "🍡", label: "sweets & coffee", color: "#d6336c" },
  night:  { emoji: "🍻", label: "nightcaps", color: "#5f3dc4" },
  temple: { emoji: "⛩️", label: "shrines & temples", color: "#e8590c" },
  park:   { emoji: "🌳", label: "green stuff", color: "#2f9e44" },
  hood:   { emoji: "🏘️", label: "hoods to wander", color: "#4263eb" },
  shop:   { emoji: "🛍️", label: "shopping", color: "#1098ad" },
  museum: { emoji: "🎨", label: "culture", color: "#be4bdb" },
  view:   { emoji: "🗼", label: "views & landmarks", color: "#495057" },
  trip:   { emoji: "🚆", label: "day trips", color: "#8a5a44" },
  onsen:  { emoji: "♨️", label: "hot water", color: "#0c8599" },
  fun:    { emoji: "🎯", label: "shenanigans", color: "#f08c00" },
};

const LS = {
  places: "nippon_custom_places",
  doodles: "nippon_doodles",
  zones: "nippon_custom_zones",
};
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---------- data ----------
const BASE = window.NIPPON || { places: [], chains: [], zones: [], doodles: [] };
const baseIds = new Set(BASE.places.map((p) => p.id));
let customPlaces = lsGet(LS.places).filter((p) => !baseIds.has(p.id)); // skip ones already baked into data.js
let doodles = [...(BASE.doodles || []), ...lsGet(LS.doodles)];
let customZones = lsGet(LS.zones);

const allPlaces = () => [...BASE.places, ...customPlaces];
const placeById = (id) => allPlaces().find((p) => p.id === id);

// ---------- state ----------
const state = {
  mode: null,                 // null | lasso | pen | add | mix
  cats: new Set(Object.keys(CATS)),
  starOnly: false,
  q: "",
  lasso: null,                // { ids:[], layer, points }
  mix: { name: "", ids: new Set() },
  mixView: null,              // { name, ids:Set }
  zonesOn: true,
  penColor: "#e03131",
};

// ---------- map ----------
const map = L.map("map", { zoomControl: false, attributionControl: true });
L.control.zoom({ position: "bottomright" }).addTo(map);
map.attributionControl.setPrefix("🗾 NIPPON TOP");
L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> © <a href='https://carto.com/attributions'>CARTO</a>",
  maxZoom: 20,
}).addTo(map);

const zoneLayer = L.layerGroup().addTo(map);
const doodleLayer = L.layerGroup().addTo(map);

const PAD = () => (window.innerWidth > 940
  ? { paddingTopLeft: [80, 90], paddingBottomRight: [430, 40] }
  : { paddingTopLeft: [20, 140], paddingBottomRight: [20, Math.round(window.innerHeight * 0.5)] });

function groupBounds(group) {
  const pts = allPlaces().filter((p) => group === "all" || p.group === group).map((p) => [p.lat, p.lng]);
  return pts.length ? L.latLngBounds(pts) : L.latLngBounds([[35.6, 139.7]]);
}

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const linkify = (escaped) => escaped.replace(/https?:\/\/[^\s<)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.length > 38 ? u.slice(0, 35) + "…" : u}</a>`);

function showHint(text, ms) {
  const el = $("#modeHint");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(showHint._t);
  if (ms) showHint._t = setTimeout(() => el.classList.add("hidden"), ms);
}
const hideHint = () => $("#modeHint").classList.add("hidden");

function pointInPoly(lat, lng, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i], [yj, xj] = pts[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- markers ----------
const markers = {}; // id -> L.marker

function pinIcon(p) {
  const cat = CATS[p.cat] || CATS.fun;
  const size = p.star ? 38 : 30;
  const cls = ["pin", p.star ? "star" : "", p.approx ? "approx" : "", String(p.id).startsWith("custom-") ? "custom-pin" : ""].join(" ");
  const html = `<div class="${cls}" style="--pin:${cat.color}">
      <span class="pin-emoji">${p.emoji || cat.emoji}</span>
      ${p.star ? '<span class="pin-badge">⭐</span>' : ""}
      <span class="mix-badge">💌</span>
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
  if (link) link.addEventListener("click", () => { openSidebar(); selectPlace(p.id, { fly: false }); });
  return div;
}

function makeMarker(p) {
  const m = L.marker([p.lat, p.lng], { icon: pinIcon(p), riseOnHover: true, zIndexOffset: p.star ? 500 : 0 });
  m.bindTooltip(`${p.star ? "⭐ " : ""}${esc(p.name)}`, { className: "nippon-tip", direction: "top" });
  m.bindPopup(() => popupContent(p), { offset: [0, -6], maxWidth: 260 });
  m.on("click", (e) => {
    if (state.mode === "mix") {
      L.DomEvent.stop(e);
      m.closePopup();
      toggleMix(p.id);
      return;
    }
    selectPlace(p.id, { fly: false });
  });
  markers[p.id] = m;
  return m;
}

function placePassesFilters(p) {
  if (!state.cats.has(p.cat)) return false;
  if (state.starOnly && !p.star) return false;
  if (state.q) {
    const hay = `${p.name} ${p.notes} ${p.region}`.toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function refreshMarkers() {
  for (const p of allPlaces()) {
    const m = markers[p.id] || makeMarker(p);
    const show = placePassesFilters(p);
    if (show && !map.hasLayer(m)) m.addTo(map);
    if (!show && map.hasLayer(m)) m.remove();
    const el = m.getElement();
    if (el) {
      el.classList.toggle("dimmed", !!state.mixView && !state.mixView.ids.has(p.id));
      const pin = el.querySelector(".pin");
      if (pin) pin.classList.toggle("in-mix", state.mode === "mix" && state.mix.ids.has(p.id));
    }
  }
}

// ---------- sidebar list ----------
function currentList() {
  let list = allPlaces().filter(placePassesFilters);
  if (state.mixView) return list.filter((p) => state.mixView.ids.has(p.id));
  if (state.lasso) return list.filter((p) => state.lasso.ids.includes(p.id));
  const b = map.getBounds().pad(0.02);
  return list.filter((p) => b.contains([p.lat, p.lng]));
}

function renderContextBar() {
  const bar = $("#contextBar");
  bar.innerHTML = "";
  const n = currentList().length;
  const label = document.createElement("span");
  if (state.mixView) {
    label.textContent = `💌 ${state.mixView.name}'s mixtape — ${n} spots`;
  } else if (state.lasso) {
    label.textContent = `🪢 lassoed ${n} spot${n === 1 ? "" : "s"}`;
    const clear = document.createElement("button");
    clear.className = "ctx-btn";
    clear.textContent = "✕ clear";
    clear.onclick = clearLasso;
    const save = document.createElement("button");
    save.className = "ctx-btn gold";
    save.textContent = "🎿 save as zone";
    save.onclick = saveLassoAsZone;
    bar.append(label, clear, save);
    return;
  } else {
    label.textContent = `👀 ${n} in view`;
  }
  bar.append(label);
}

function cardEl(p) {
  const card = document.createElement("article");
  const isCustom = String(p.id).startsWith("custom-");
  card.className = `card${p.star ? " starred" : ""}`;
  card.dataset.id = p.id;
  const cat = CATS[p.cat] || CATS.fun;
  card.innerHTML = `
    ${p.star ? '<span class="banger-ribbon">CERTIFIED BANGER</span>' : ""}
    <div class="card-head">
      <span class="card-emoji">${p.emoji || cat.emoji}</span>
      <span class="card-name">${esc(p.name)}</span>
      ${p.star ? '<span class="card-star">⭐</span>' : ""}
    </div>
    <div class="card-pills">
      <span class="pill">${cat.emoji} ${cat.label}</span>
      <span class="pill">📍 ${esc(p.region)}</span>
      ${p.approx ? '<span class="pill approx" title="the geocoder shrugged — pin placed from memory">~ish location</span>' : ""}
      ${isCustom ? '<span class="pill custom">✏️ hand-added</span>' : ""}
    </div>
    <div class="card-notes">${linkify(esc(p.notes))}</div>
    ${p.notes && p.notes.length > 180 ? '<button class="card-more">the whole rant ▾</button>' : ""}
    ${isCustom ? '<button class="card-del" title="delete this spot">🗑️</button>' : ""}`;

  card.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    if (e.target.classList.contains("card-more")) {
      card.classList.toggle("open");
      e.target.textContent = card.classList.contains("open") ? "less ▴" : "the whole rant ▾";
      return;
    }
    if (e.target.classList.contains("card-del")) {
      if (confirm(`delete "${p.name}"? it never happened.`)) {
        customPlaces = customPlaces.filter((c) => c.id !== p.id);
        lsSet(LS.places, customPlaces);
        if (markers[p.id]) { markers[p.id].remove(); delete markers[p.id]; }
        refreshAll();
      }
      return;
    }
    if (state.mode === "mix") { toggleMix(p.id); return; }
    selectPlace(p.id, { fly: true });
  });
  card.addEventListener("mouseenter", () => {
    const m = markers[p.id];
    if (m && m.getElement()) m.getElement().querySelector(".pin").style.transform = "rotate(-45deg) scale(1.3)";
  });
  card.addEventListener("mouseleave", () => {
    const m = markers[p.id];
    if (m && m.getElement()) m.getElement().querySelector(".pin").style.transform = "";
  });
  return card;
}

function renderList() {
  const wrap = $("#cards");
  wrap.innerHTML = "";
  const list = currentList().sort((a, b) => (b.star - a.star) || a.name.localeCompare(b.name));
  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state"><span class="big">🍥</span>nothing here…<br>zoom out, clear filters, or lasso somewhere tastier</div>`;
  } else {
    for (const p of list) wrap.append(cardEl(p));
  }
  renderContextBar();
  const total = allPlaces().length;
  $("#footCount").textContent = `${total} recs · ${allPlaces().filter((p) => p.star).length} bangers · ${BASE.chains.length} chains`;
}

function refreshAll() { refreshMarkers(); renderList(); }

function selectPlace(id, { fly } = {}) {
  const p = placeById(id);
  if (!p) return;
  if (fly) {
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    setTimeout(() => markers[id] && markers[id].openPopup(), 850);
  }
  document.querySelectorAll(".card.selected").forEach((c) => c.classList.remove("selected"));
  const card = document.querySelector(`.card[data-id="${CSS.escape(String(id))}"]`);
  if (card) {
    card.classList.add("selected");
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// ---------- filters UI ----------
function buildCatChips() {
  const wrap = $("#catChips");
  for (const [key, cat] of Object.entries(CATS)) {
    const b = document.createElement("button");
    b.textContent = cat.emoji;
    b.title = cat.label;
    b.onclick = () => {
      if (state.cats.has(key) && state.cats.size === Object.keys(CATS).length) {
        state.cats = new Set([key]); // first click on a full set = solo that category
      } else if (state.cats.has(key)) {
        state.cats.delete(key);
        if (!state.cats.size) state.cats = new Set(Object.keys(CATS)); // never strand an empty map
      } else {
        state.cats.add(key);
      }
      [...wrap.children].forEach((c, i) => c.classList.toggle("off", !state.cats.has(Object.keys(CATS)[i])));
      refreshAll();
    };
    wrap.append(b);
  }
}

$("#starToggle").addEventListener("click", (e) => {
  state.starOnly = !state.starOnly;
  e.currentTarget.classList.toggle("active", state.starOnly);
  refreshAll();
});

$("#search").addEventListener("input", (e) => {
  state.q = e.target.value.trim().toLowerCase();
  refreshAll();
});

// ---------- region chips ----------
$("#regionChips").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#regionChips button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  map.flyToBounds(groupBounds(btn.dataset.group), { ...PAD(), duration: 1.1 });
});

// ---------- modes ----------
function setMode(mode) {
  state.mode = state.mode === mode ? null : mode;
  const m = state.mode;
  document.querySelectorAll("#toolbar button[data-tool]").forEach((b) => {
    if (["lasso", "pen", "add", "mix"].includes(b.dataset.tool)) b.classList.toggle("active", b.dataset.tool === m);
  });
  const mapEl = $("#map");
  mapEl.classList.toggle("lassoing", m === "lasso");
  mapEl.classList.toggle("penning", m === "pen");
  mapEl.classList.toggle("adding", m === "add");
  mapEl.style.touchAction = m === "lasso" || m === "pen" ? "none" : "";
  if (m === "lasso" || m === "pen") map.dragging.disable(); else map.dragging.enable();
  $("#penTray").classList.toggle("hidden", m !== "pen");
  $("#mixBar").classList.toggle("hidden", m !== "mix");
  const hints = {
    lasso: "🪢 draw a loop around some spots — everything inside shows up in the list",
    pen: "🖊️ scribble on the map — ink sticks to the terrain, iPad approved",
    add: "📍 click the map right where the new spot goes",
    mix: "💌 click pins (or cards) to add them to the mixtape",
  };
  if (m) showHint(hints[m]); else hideHint();
  if (m !== "mix") refreshMarkers(); // clear mix badges when leaving
}

document.querySelectorAll("#toolbar button[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const t = btn.dataset.tool;
    if (t === "zones") {
      state.zonesOn = !state.zonesOn;
      btn.classList.toggle("active", state.zonesOn);
      if (state.zonesOn) zoneLayer.addTo(map); else zoneLayer.remove();
    } else if (t === "chains") {
      $("#chainsDrawer").classList.toggle("hidden");
    } else if (t === "export") {
      exportData();
    } else {
      setMode(t);
    }
  });
});

// ---------- lasso ----------
let sketch = null; // { pts:[latlng], line, lastPx }

function containerLatLng(e) {
  const rect = $("#map").getBoundingClientRect();
  return map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
}

$("#map").addEventListener("pointerdown", (e) => {
  if (state.mode !== "lasso" && state.mode !== "pen") return;
  if (!e.isPrimary) return;
  e.preventDefault();
  const ll = containerLatLng(e);
  const color = state.mode === "pen" ? state.penColor : "#2b2b33";
  sketch = {
    pts: [ll],
    lastPx: [e.clientX, e.clientY],
    line: L.polyline([ll], {
      color,
      weight: state.mode === "pen" ? 4 : 3,
      dashArray: state.mode === "lasso" ? "8 8" : null,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map),
  };
}, true);

window.addEventListener("pointermove", (e) => {
  if (!sketch || !e.isPrimary) return;
  const dx = e.clientX - sketch.lastPx[0], dy = e.clientY - sketch.lastPx[1];
  if (dx * dx + dy * dy < 16) return;
  sketch.lastPx = [e.clientX, e.clientY];
  sketch.pts.push(containerLatLng(e));
  sketch.line.setLatLngs(sketch.pts);
});

window.addEventListener("pointerup", (e) => {
  if (!sketch || !e.isPrimary) return;
  const { pts, line } = sketch;
  sketch = null;
  if (state.mode === "pen") {
    if (pts.length < 2) { line.remove(); return; }
    line.remove();
    const stroke = { color: state.penColor, pts: pts.map((ll) => [+ll.lat.toFixed(6), +ll.lng.toFixed(6)]) };
    doodles.push(stroke);
    drawDoodle(stroke);
    lsSet(LS.doodles, doodles.filter((d) => !(BASE.doodles || []).includes(d)));
    return;
  }
  // lasso
  line.remove();
  if (pts.length < 5) { showHint("🪢 that was barely a squiggle — try a bigger loop", 2200); return; }
  const poly = pts.map((ll) => [ll.lat, ll.lng]);
  clearLasso(true);
  const ids = allPlaces().filter((p) => placePassesFilters(p) && pointInPoly(p.lat, p.lng, poly)).map((p) => p.id);
  const layer = L.polygon(poly, { color: "#2b2b33", weight: 3, dashArray: "10 8", fillColor: "#f5b301", fillOpacity: 0.12 }).addTo(map);
  state.lasso = { ids, layer, points: poly };
  setMode(null);
  openSidebar();
  renderList();
  showHint(ids.length ? `🪢 got ${ids.length} — they're in the list →` : "🪢 nothing in there… cast a wider net", 2500);
});

function clearLasso(silent) {
  if (state.lasso) state.lasso.layer.remove();
  state.lasso = null;
  if (!silent) renderList();
}

// ---------- zones ----------
const ZONE_COLORS = ["#e8590c", "#9c36b5", "#2f9e44", "#1098ad", "#e03131", "#f08c00"];

function drawZone(z, isCustom) {
  const poly = L.polygon(z.points, {
    color: z.color, weight: 3, dashArray: "12 8", fillColor: z.color, fillOpacity: 0.13,
  }).addTo(zoneLayer);
  const c = z.points.reduce((a, p) => [a[0] + p[0] / z.points.length, a[1] + p[1] / z.points.length], [0, 0]);
  const label = L.marker(c, {
    icon: L.divIcon({ className: "zone-label-wrap", html: `<span class="zone-label" style="--z:${z.color}">${esc(z.name)}</span>`, iconSize: null }),
    interactive: true,
  }).addTo(zoneLayer);
  const div = document.createElement("div");
  div.innerHTML = `<div class="popup-title">🎿 ${esc(z.name)}</div><div class="popup-blurb">${esc(z.blurb) || "<i>a zone of unspecified vibes</i>"}</div>
    ${isCustom ? '<span class="popup-link">🗑️ remove this zone</span>' : ""}`;
  const del = div.querySelector(".popup-link");
  if (del) del.addEventListener("click", () => {
    customZones = customZones.filter((cz) => cz.id !== z.id);
    lsSet(LS.zones, customZones);
    zoneLayer.removeLayer(poly);
    zoneLayer.removeLayer(label);
    map.closePopup();
  });
  poly.bindPopup(div);
  label.on("click", () => poly.openPopup(c));
}

function saveLassoAsZone() {
  if (!state.lasso) return;
  const name = prompt("name this zone (ski map style — 'here be tsukemen'):");
  if (!name) return;
  const blurb = prompt("one-liner about the vibes here (optional):") || "";
  const z = {
    id: "zone-" + Date.now().toString(36),
    name, blurb,
    color: ZONE_COLORS[(BASE.zones.length + customZones.length) % ZONE_COLORS.length],
    points: state.lasso.points.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]),
  };
  customZones.push(z);
  lsSet(LS.zones, customZones);
  drawZone(z, true);
  clearLasso();
  showHint(`🎿 "${name}" is now officially a zone`, 2500);
}

// ---------- doodles ----------
function drawDoodle(d) {
  L.polyline(d.pts, { color: d.color, weight: 4, lineCap: "round", lineJoin: "round", opacity: 0.85 })
    .addTo(doodleLayer)
    ._nipponDoodle = d;
}

$("#penTray").addEventListener("click", (e) => {
  const sw = e.target.closest(".swatch");
  if (sw) {
    state.penColor = sw.dataset.color;
    document.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === sw));
  }
});
$("#penUndo").addEventListener("click", () => {
  const layers = doodleLayer.getLayers();
  if (!layers.length) return;
  const last = layers[layers.length - 1];
  doodles = doodles.filter((d) => d !== last._nipponDoodle);
  doodleLayer.removeLayer(last);
  lsSet(LS.doodles, doodles.filter((d) => !(BASE.doodles || []).includes(d)));
});
$("#penClear").addEventListener("click", () => {
  if (!doodles.length || !confirm("erase ALL the ink? no take-backs.")) return;
  doodles = [];
  doodleLayer.clearLayers();
  lsSet(LS.doodles, []);
});

// ---------- add a spot ----------
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
  customPlaces.push(place);
  lsSet(LS.places, customPlaces);
  $("#addModal").classList.add("hidden");
  setMode(null);
  refreshAll();
  selectPlace(place.id, { fly: false });
  showHint(`📍 "${name}" is on the map — export 💾 to make it permanent`, 3500);
});

// ---------- mixtape ----------
function toggleMix(id) {
  if (state.mix.ids.has(id)) state.mix.ids.delete(id); else state.mix.ids.add(id);
  $("#mixCount").textContent = `${state.mix.ids.size} spot${state.mix.ids.size === 1 ? "" : "s"}`;
  refreshMarkers();
}

$("#mixCancel").addEventListener("click", () => { state.mix = { name: "", ids: new Set() }; setMode(null); });
$("#mixCopy").addEventListener("click", async () => {
  const name = $("#mixName").value.trim() || "you";
  if (!state.mix.ids.size) { showHint("💌 the mixtape is empty — click some pins first", 2500); return; }
  const url = `${location.href.split("#")[0]}#mix=${encodeURIComponent(name)}~${[...state.mix.ids].join(".")}`;
  try {
    await navigator.clipboard.writeText(url);
    showHint(`💌 link copied — ${state.mix.ids.size} spots, hand-rolled for ${name}`, 3000);
  } catch {
    prompt("copy this link:", url);
  }
});

function parseMixHash() {
  const m = location.hash.match(/^#mix=([^~]+)~(.+)$/);
  if (!m) return null;
  const ids = new Set(m[2].split(".").filter((id) => placeById(id)));
  return ids.size ? { name: decodeURIComponent(m[1]), ids } : null;
}

function enterMixView() {
  const mv = parseMixHash();
  state.mixView = mv;
  $("#mixBanner").classList.toggle("hidden", !mv);
  if (mv) {
    $("#mixBannerText").textContent = `🎁 a hand-rolled japan mixtape for ${mv.name} — ${mv.ids.size} spot${mv.ids.size === 1 ? "" : "s"}, curated with love`;
    const pts = [...mv.ids].map((id) => { const p = placeById(id); return [p.lat, p.lng]; });
    map.fitBounds(L.latLngBounds(pts), PAD());
  }
  refreshAll();
}

$("#mixShowAll").addEventListener("click", () => {
  history.replaceState(null, "", location.pathname + location.search);
  state.mixView = null;
  $("#mixBanner").classList.add("hidden");
  refreshAll();
});
window.addEventListener("hashchange", enterMixView);

// ---------- chain gang ----------
function buildChains() {
  const body = $("#chainsBody");
  for (const c of BASE.chains) {
    const div = document.createElement("div");
    div.className = "chain-card";
    div.innerHTML = `<div class="chain-name">${c.emoji} ${esc(c.name)}</div><div class="chain-notes">${linkify(esc(c.notes))}</div>`;
    body.append(div);
  }
}
$("#drawerClose").addEventListener("click", () => $("#chainsDrawer").classList.add("hidden"));

// ---------- export ----------
function exportData() {
  const merged = {
    places: allPlaces(),
    chains: BASE.chains,
    zones: [...BASE.zones, ...customZones],
    doodles,
  };
  const out = `// NIPPON TOP data — exported ${new Date().toISOString().slice(0, 10)} from the app itself.\nwindow.NIPPON = ${JSON.stringify(merged, null, 2)};\n`;
  const blob = new Blob([out], { type: "text/javascript" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.js";
  a.click();
  URL.revokeObjectURL(a.href);
  showHint("💾 drop that data.js into the repo — your edits are now canon", 3500);
}

// ---------- sidebar collapse ----------
const sidebar = $("#sidebar");
const tab = $("#sidebarTab");
const collapseBtn = document.createElement("button");
collapseBtn.className = "sidebar-collapse";
collapseBtn.title = "tuck the list away";
collapseBtn.textContent = "▸";
$(".sidebar-head").append(collapseBtn);
collapseBtn.addEventListener("click", () => { sidebar.classList.add("collapsed"); tab.classList.remove("hidden"); });
tab.addEventListener("click", openSidebar);
function openSidebar() { sidebar.classList.remove("collapsed"); tab.classList.add("hidden"); }
tab.classList.add("hidden");

// ---------- wire it up ----------
map.on("moveend", () => { if (!state.lasso && !state.mixView) renderList(); });

buildCatChips();
buildCatPick();
buildChains();
BASE.zones.forEach((z) => drawZone(z, false));
customZones.forEach((z) => drawZone(z, true));
doodles.forEach(drawDoodle);

map.fitBounds(groupBounds("tokyo"), PAD());
refreshAll();
enterMixView();

console.log("%c🗾 NIPPON TOP %c74 recs of extremely correct opinions", "font-size:20px;font-weight:bold", "font-size:12px");
