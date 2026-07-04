// All data + app state. Base data comes from data.js (window.NIPPON);
// Ken's in-browser edits layer on top via localStorage until exported.
import { LS, CATS } from "./config.js";
import { map } from "./map.js";
import { generateKey, randomSuffix } from "./pack.js";

const lsGet = (k, fb = []) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const BASE = window.NIPPON || { places: [], chains: [], zones: [], doodles: [], curations: [] };
BASE.doodles = BASE.doodles || [];
BASE.curations = BASE.curations || [];

const baseIds = new Set(BASE.places.map((p) => p.id));
// skip customs already baked into data.js by a previous export
let customPlaces = lsGet(LS.places).filter((p) => !baseIds.has(p.id));
let customZones = lsGet(LS.zones);
let customCurations = lsGet(LS.curations).filter((c) => !BASE.curations.some((b) => b.slug === c.slug || b.slug === c.baseSlug));

// deleting exported ink/zones needs a tombstone — otherwise data.js resurrects
// them on reload. Tombstones for ids no longer in data.js have done their job; prune.
let deadDoodles = new Set(lsGet(LS.deadDoodles).filter((id) => BASE.doodles.some((d) => d.id === id)));
lsSet(LS.deadDoodles, [...deadDoodles]);
let deadZones = new Set(lsGet(LS.deadZones).filter((id) => BASE.zones.some((z) => z.id === id)));
lsSet(LS.deadZones, [...deadZones]);
let hiddenZones = new Set(lsGet(LS.hiddenZones));
const localDoodles = lsGet(LS.doodles).filter((d) => !BASE.doodles.some((b) => b.id && b.id === d.id));
export let doodles = [...BASE.doodles.filter((d) => !deadDoodles.has(d.id)), ...localDoodles];

// photos dropped in dev mode overlay any place until they're baked in by an
// export; entries already matching data.js get pruned (same idea as customs)
const photoOverlay = lsGet(LS.photos, {});
for (const p of BASE.places) if (photoOverlay[p.id] === p.photo) delete photoOverlay[p.id];
for (const p of [...BASE.places, ...customPlaces]) if (photoOverlay[p.id]) p.photo = photoOverlay[p.id];
lsSet(LS.photos, photoOverlay);

export const state = {
  mode: null,                 // null | lasso | pen | add | curate
  cats: new Set(Object.keys(CATS)),
  starOnly: false,
  q: "",
  lasso: null,                // { ids:[], layer, points }
  zoneFilter: null,           // { id, name, ids } — sidebar scoped to one zone
  selectedId: null,           // place highlighted in the list
  detailId: null,             // place open in the detail panel
  curationView: null,         // curation being viewed via #for= link
  editingCuration: null,      // curation object being edited in curate mode
  zonesOn: true,
  inkOn: true,
  penColor: "#e03131",
  penWidth: 4,                // brush base weight at draw zoom
  penHl: false,               // highlighter brush
  penErase: false,            // eraser picked up (pen mode stops drawing)
  penText: false,             // text sticker tool armed
  penStamp: null,             // stamp kind armed (see stamps.js), or null
  userLoc: null,              // [lat, lng] once located
};

// ---------- friend-pack overlay ----------
// The pack being viewed (#for= link) or edited (curate mode) can carry its own
// extra places/zones/ink. Reads merge them in; writes made while editing a
// friend map land in that pack (in-memory until saved), not the global overlay.
const activePack = () => state.curationView || state.editingCuration;

function packTarget(kind) {
  const cur = state.editingCuration;
  if (!cur) return null;
  cur[kind] = cur[kind] || [];
  return cur[kind];
}

// ---------- places ----------
export const allPlaces = () => [...BASE.places, ...customPlaces, ...(activePack()?.extraPlaces || [])];
export const placeById = (id) => allPlaces().find((p) => p.id === id);
export const isCustom = (id) => String(id).startsWith("custom-");
export const isPackExtra = (id) => (activePack()?.extraPlaces || []).some((p) => p.id === id);

export function addPlace(p) {
  const t = packTarget("extraPlaces");
  if (t) { t.push(p); return; }
  customPlaces.push(p);
  lsSet(LS.places, customPlaces);
}
export function deletePlace(id) {
  const t = packTarget("extraPlaces");
  if (t && t.some((p) => p.id === id)) {
    state.editingCuration.extraPlaces = t.filter((p) => p.id !== id);
    return;
  }
  customPlaces = customPlaces.filter((c) => c.id !== id);
  lsSet(LS.places, customPlaces);
  delete photoOverlay[id];
  lsSet(LS.photos, photoOverlay);
}

export function setPhoto(id, file) {
  const p = placeById(id);
  if (p) p.photo = file;
  photoOverlay[id] = file;
  lsSet(LS.photos, photoOverlay);
}

// ---------- filters / lists ----------
export function placePassesFilters(p) {
  if (!state.cats.has(p.cat)) return false;
  if (state.starOnly && !p.star) return false;
  if (state.q) {
    const hay = `${p.name} ${p.notes} ${p.region}`.toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

// what the sidebar should show right now
export function currentList() {
  let list = allPlaces().filter(placePassesFilters);
  if (state.curationView) {
    const vis = curationVisibleIds(state.curationView);
    list = list.filter((p) => vis.has(p.id));
  }
  if (state.zoneFilter) return list.filter((p) => state.zoneFilter.ids.includes(p.id));
  if (state.lasso) return list.filter((p) => state.lasso.ids.includes(p.id));
  if (state.curationView) return list;
  const b = map.getBounds().pad(0.02);
  return list.filter((p) => b.contains([p.lat, p.lng]));
}

export function groupBounds(group) {
  const pts = allPlaces().filter((p) => group === "all" || p.group === group).map((p) => [p.lat, p.lng]);
  return pts.length ? L.latLngBounds(pts) : L.latLngBounds([[35.6, 139.7]]);
}

// ---------- doodles ----------
const persistDoodles = () => lsSet(LS.doodles, doodles.filter((d) => !BASE.doodles.includes(d)));
const tombstone = (d) => {
  if (!BASE.doodles.includes(d) || !d.id) return;
  deadDoodles.add(d.id);
  lsSet(LS.deadDoodles, [...deadDoodles]);
};
export const allDoodles = () => [...doodles, ...(activePack()?.extraDoodles || [])];
export function addDoodle(d) {
  d.id = d.id || "d-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  if (deadDoodles.delete(d.id)) lsSet(LS.deadDoodles, [...deadDoodles]); // undo of a base-ink delete
  const t = packTarget("extraDoodles");
  if (t) { t.push(d); return; }
  doodles.push(d);
  persistDoodles();
}
// returns whether anything was removed — a friend's undo must skip pack ink they don't own
export function removeDoodle(d) {
  const t = packTarget("extraDoodles");
  if (t && t.includes(d)) {
    state.editingCuration.extraDoodles = t.filter((x) => x !== d);
    return true;
  }
  if (!doodles.includes(d)) return false;
  tombstone(d);
  doodles = doodles.filter((x) => x !== d);
  persistDoodles();
  return true;
}
export function clearDoodles() {
  const t = packTarget("extraDoodles");
  if (t) { state.editingCuration.extraDoodles = []; return; }
  doodles.forEach(tombstone);
  doodles = [];
  lsSet(LS.doodles, []);
}

// ---------- zones ----------
// customZones shadow BASE zones by id (copy-on-write edits); deleting a base
// zone tombstones it. Pack zones are only editable while editing the pack.
export const allZones = () => {
  const shadowed = new Set(customZones.map((z) => z.id));
  return [
    ...BASE.zones.filter((z) => !shadowed.has(z.id) && !deadZones.has(z.id)).map((z) => ({ ...z, custom: true })),
    ...customZones.map((z) => ({ ...z, custom: true })),
    ...(activePack()?.extraZones || []).map((z) => ({ ...z, custom: !!state.editingCuration, pack: true })),
  ];
};
export function addZone(z) {
  const t = packTarget("extraZones");
  if (t) { t.push(z); return; }
  customZones.push(z);
  lsSet(LS.zones, customZones);
}
// covers create + edit: pack zones update in the pack, base zones become shadows
export function updateZone(z) {
  const t = packTarget("extraZones");
  if (t && t.some((x) => x.id === z.id)) {
    state.editingCuration.extraZones = t.map((x) => (x.id === z.id ? z : x));
    return;
  }
  customZones = [...customZones.filter((x) => x.id !== z.id), z];
  lsSet(LS.zones, customZones);
}
export function removeZone(id) {
  const t = packTarget("extraZones");
  if (t && t.some((z) => z.id === id)) {
    state.editingCuration.extraZones = t.filter((z) => z.id !== id);
    return;
  }
  if (BASE.zones.some((z) => z.id === id)) {
    deadZones.add(id);
    lsSet(LS.deadZones, [...deadZones]);
  }
  customZones = customZones.filter((z) => z.id !== id);
  lsSet(LS.zones, customZones);
}
export const zoneCount = () => allZones().length;
export const zoneHidden = (id) => hiddenZones.has(id);
export function toggleZoneHidden(id) {
  if (!hiddenZones.delete(id)) hiddenZones.add(id);
  lsSet(LS.hiddenZones, [...hiddenZones]);
}

// ---------- curations (friend-map forks) ----------
// { slug, name, emoji, message, mode: "exclude"|"include", ids: [], notes: {placeId: text},
//   seen: [], updated, file, key, extraPlaces: [], extraZones: [], extraDoodles: [] }
// exclude-mode: base minus ids — new recs flow in automatically (rebase on head).
// include-mode: handpicked list — `seen` records base ids known at last edit, for staleness hints.
// file+key are minted once on first save and never change: `file` names the published
// friends/<file>.enc blob, `key` decrypts it and rides only in the share link.
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "friend";

export function uniqueSlug(name) {
  const taken = new Set(allCurations().map((c) => c.slug));
  const base = slugify(name);
  let out = base, i = 2;
  while (taken.has(out)) out = `${base}-${i++}`;
  return out;
}

export const allCurations = () => {
  const overridden = new Set(customCurations.map((c) => c.slug));
  return [...BASE.curations.filter((c) => !overridden.has(c.slug)), ...customCurations];
};
export const curationBySlug = (slug) => allCurations().find((c) => c.slug === slug);

export function curationVisibleIds(cur) {
  const ids = new Set(cur.ids);
  const vis = new Set();
  for (const p of allPlaces()) {
    if (cur.mode === "include" ? ids.has(p.id) : !ids.has(p.id)) vis.add(p.id);
  }
  for (const p of cur.extraPlaces || []) vis.add(p.id); // pack extras are always on their map
  return vis;
}

// base ids added since this curation was last touched (staleness signal)
export function curationUnseenIds(cur) {
  const seen = new Set(cur.seen || []);
  return BASE.places.filter((p) => !seen.has(p.id)).map((p) => p.id);
}

export function upsertCuration(cur) {
  cur.updated = new Date().toISOString().slice(0, 10);
  cur.seen = BASE.places.map((p) => p.id);
  cur.slug = cur.slug || uniqueSlug(cur.name);
  cur.file = cur.file || `${cur.slug}-${randomSuffix()}`; // stable forever — the link depends on it
  cur.key = cur.key || generateKey();
  customCurations = customCurations.filter((c) => c.slug !== cur.slug);
  customCurations.push(cur);
  lsSet(LS.curations, customCurations);
}
export function deleteCuration(slug) {
  customCurations = customCurations.filter((c) => c.slug !== slug);
  lsSet(LS.curations, customCurations);
}

// ---------- export ----------
// raw arrays only: pack extras and curations never ride into data.js —
// friend maps ship separately as encrypted packs (js/pack.js)
export function mergedData() {
  return {
    places: [...BASE.places, ...customPlaces],
    chains: BASE.chains,
    // shadow edits win over their base zone; tombstoned zones stay gone
    zones: [...BASE.zones.filter((z) => !customZones.some((c) => c.id === z.id) && !deadZones.has(z.id)), ...customZones],
    doodles,
  };
}
