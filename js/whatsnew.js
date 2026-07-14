// Returning-visitor treat: this browser remembers which base recs it has seen
// (viewer-local localStorage, not part of Ken's edit overlay) and offers a
// one-tap scope down to just the fresh ones. The filter rides state.newFilter,
// so the sidebar and roulette follow like they do for zones.
import { $ } from "./config.js";
import { map, PAD } from "./map.js";
import { state, BASE, placeById, curationVisibleIds } from "./store.js";
import { emit, on } from "./bus.js";

const KEY = "nippon_last_visit";

function fmtDay(iso) {
  const d = new Date(iso + "T00:00:00");
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts).toLowerCase();
}

// call after enterHashView settles so a friend-pack view can veto hidden spots
export function checkWhatsNew() {
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(KEY)); } catch { /* fresh eyes */ }
  const ids = BASE.places.map((p) => p.id);
  localStorage.setItem(KEY, JSON.stringify({ ids, date: new Date().toISOString().slice(0, 10) }));
  if (!Array.isArray(prev?.ids) || !prev.date) return; // first visit: it's all new, nothing to point at
  const seen = new Set(prev.ids);
  let fresh = ids.filter((id) => !seen.has(id));
  if (state.curationView) {
    const vis = curationVisibleIds(state.curationView);
    fresh = fresh.filter((id) => vis.has(id)); // frozen include-maps don't inherit new recs
  }
  if (!fresh.length) return;

  const el = $("#whatsNew");
  const since = fmtDay(prev.date);
  $("#whatsNewText").textContent =
    `ken added ${fresh.length === 1 ? "a new spot" : `${fresh.length} new spots`} since you were last here on ${since}`;
  el.classList.remove("hidden");
  const timer = setTimeout(() => el.classList.add("hidden"), 18000);
  const hide = () => { clearTimeout(timer); el.classList.add("hidden"); };
  $("#whatsNewNah").onclick = hide;
  $("#whatsNewGo").onclick = () => {
    hide();
    state.newFilter = { ids: fresh, since };
    const pts = fresh.map((id) => placeById(id)).filter(Boolean).map((p) => [p.lat, p.lng]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { ...PAD(), maxZoom: 13 });
    emit("open-sidebar");
    emit("refresh");
  };
}

export function initWhatsNew() {
  on("newfilter-clear", () => { state.newFilter = null; emit("refresh"); });
}
