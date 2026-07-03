// All data + app state. Base data comes from data.js (window.NIPPON);
// Ken's in-browser edits layer on top via localStorage until exported.
import { LS, CATS } from "./config.js";
import { map } from "./map.js";

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const BASE = window.NIPPON || { places: [], chains: [], zones: [], doodles: [], curations: [] };
BASE.doodles = BASE.doodles || [];
BASE.curations = BASE.curations || [];

const baseIds = new Set(BASE.places.map((p) => p.id));
// skip customs already baked into data.js by a previous export
let customPlaces = lsGet(LS.places).filter((p) => !baseIds.has(p.id));
let customZones = lsGet(LS.zones);
let customCurations = lsGet(LS.curations).filter((c) => !BASE.curations.some((b) => b.slug === c.slug || b.slug === c.baseSlug));
export let doodles = [...BASE.doodles, ...lsGet(LS.doodles)];

export const state = {
  mode: null,                 // null | lasso | pen | add | curate
  cats: new Set(Object.keys(CATS)),
  starOnly: false,
  q: "",
  lasso: null,                // { ids:[], layer, points }
  selectedId: null,           // place highlighted in the list
  curationView: null,         // curation being viewed via #for= link
  editingCuration: null,      // curation object being edited in curate mode
  zonesOn: true,
  penColor: "#e03131",
  userLoc: null,              // [lat, lng] once located
};

// ---------- places ----------
export const allPlaces = () => [...BASE.places, ...customPlaces];
export const placeById = (id) => allPlaces().find((p) => p.id === id);
export const isCustom = (id) => String(id).startsWith("custom-");

export function addPlace(p) {
  customPlaces.push(p);
  lsSet(LS.places, customPlaces);
}
export function deletePlace(id) {
  customPlaces = customPlaces.filter((c) => c.id !== id);
  lsSet(LS.places, customPlaces);
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
    return list.filter((p) => vis.has(p.id));
  }
  if (state.lasso) return list.filter((p) => state.lasso.ids.includes(p.id));
  const b = map.getBounds().pad(0.02);
  return list.filter((p) => b.contains([p.lat, p.lng]));
}

export function groupBounds(group) {
  const pts = allPlaces().filter((p) => group === "all" || p.group === group).map((p) => [p.lat, p.lng]);
  return pts.length ? L.latLngBounds(pts) : L.latLngBounds([[35.6, 139.7]]);
}

// ---------- doodles ----------
const persistDoodles = () => lsSet(LS.doodles, doodles.filter((d) => !BASE.doodles.includes(d)));
export function addDoodle(d) { doodles.push(d); persistDoodles(); }
export function removeDoodle(d) { doodles = doodles.filter((x) => x !== d); persistDoodles(); }
export function clearDoodles() { doodles = []; lsSet(LS.doodles, []); }

// ---------- zones ----------
export const allZones = () => [...BASE.zones.map((z) => ({ ...z, custom: false })), ...customZones.map((z) => ({ ...z, custom: true }))];
export function addZone(z) { customZones.push(z); lsSet(LS.zones, customZones); }
export function removeZone(id) { customZones = customZones.filter((z) => z.id !== id); lsSet(LS.zones, customZones); }
export const zoneCount = () => BASE.zones.length + customZones.length;

// ---------- curations (friend-map forks) ----------
// { slug, name, emoji, message, mode: "exclude"|"include", ids: [], notes: {placeId: text}, seen: [], updated }
// exclude-mode: base minus ids — new recs flow in automatically (rebase on head).
// include-mode: handpicked list — `seen` records base ids known at last edit, for staleness hints.
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
  customCurations = customCurations.filter((c) => c.slug !== cur.slug);
  customCurations.push(cur);
  lsSet(LS.curations, customCurations);
}
export function deleteCuration(slug) {
  customCurations = customCurations.filter((c) => c.slug !== slug);
  lsSet(LS.curations, customCurations);
}

// ---------- export ----------
export function mergedData() {
  return {
    places: allPlaces(),
    chains: BASE.chains,
    zones: allZones().map(({ custom, ...z }) => z),
    doodles,
    curations: allCurations(),
  };
}
