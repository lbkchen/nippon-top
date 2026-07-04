// Constants + dependency-free helpers.

export const CATS = {
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

export const ZONE_COLORS = ["#e8590c", "#9c36b5", "#2f9e44", "#1098ad", "#e03131", "#f08c00"];

export const LS = {
  places: "nippon_custom_places",
  doodles: "nippon_doodles",
  deadDoodles: "nippon_dead_doodles", // ids of exported ink deleted in-app (tombstones)
  zones: "nippon_custom_zones",
  curations: "nippon_custom_curations",
  photos: "nippon_custom_photos", // { placeId: filename } — dev photo drops
};

// dev = the app can save dropped photos through tools/serve.mjs
export const DEV = ["localhost", "127.0.0.1"].includes(location.hostname);

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

export const esc = (s) =>
  (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const linkify = (escaped) =>
  escaped.replace(/https?:\/\/[^\s<)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.length > 38 ? u.slice(0, 35) + "…" : u}</a>`);

// ray-cast point-in-polygon; poly is [[lat,lng],...]
export function pointInPoly(lat, lng, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i], [yj, xj] = pts[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// where a polygon's label belongs: the interior point farthest from any edge
// (poor man's pole of inaccessibility — a grid search is plenty at zone scale;
// the vertex average lands OUTSIDE banana/C-shaped zones, which hand-drawn zones love to be)
export function labelPoint(pts) {
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const lat0 = Math.min(...lats), lat1 = Math.max(...lats);
  const lng0 = Math.min(...lngs), lng1 = Math.max(...lngs);
  const distToEdge = (lat, lng) => {
    let best = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ay, ax] = pts[j], [by, bx] = pts[i];
      const t = Math.max(0, Math.min(1, ((lat - ay) * (by - ay) + (lng - ax) * (bx - ax)) / (((by - ay) ** 2 + (bx - ax) ** 2) || 1)));
      best = Math.min(best, (lat - (ay + t * (by - ay))) ** 2 + (lng - (ax + t * (bx - ax))) ** 2);
    }
    return best;
  };
  let bestPt = null, bestD = -1;
  const N = 24;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const lat = lat0 + ((lat1 - lat0) * i) / N, lng = lng0 + ((lng1 - lng0) * j) / N;
      if (!pointInPoly(lat, lng, pts)) continue;
      const d = distToEdge(lat, lng);
      if (d > bestD) { bestD = d; bestPt = [lat, lng]; }
    }
  }
  return bestPt || [(lat0 + lat1) / 2, (lng0 + lng1) / 2];
}

// two-tap confirm for destructive buttons (house rule: no browser dialogs).
// First tap arms the button (it turns red and asks); second tap within the
// window means yes. Returns true when the action should actually run.
// Works on icon buttons too — the whole innerHTML is parked and restored.
function disarm(el) {
  el.classList.remove("armed");
  if (el.dataset.armedHtml != null) el.innerHTML = el.dataset.armedHtml;
  delete el.dataset.armed;
  delete el.dataset.armedHtml;
}
export function armCheck(el, ask = "sure?") {
  if (el.dataset.armed && Date.now() - +el.dataset.armed < 2600) {
    disarm(el);
    return true;
  }
  el.dataset.armed = Date.now();
  el.dataset.armedHtml = el.innerHTML;
  el.classList.add("armed");
  el.textContent = ask;
  const stamp = el.dataset.armed;
  setTimeout(() => {
    if (el.isConnected && el.dataset.armed === stamp) disarm(el);
  }, 2600);
  return false;
}

export function distKm(a, b) {
  const R = 6371, dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)}m` : km < 20 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`);

export const gmapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// deterministic tiny rotation per id, for the sticker-bomb look
export function jitter(id, range = 5) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((h % (range * 2 + 1)) - range);
}

export function showHint(text, ms) {
  const el = $("#modeHint");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(showHint._t);
  if (ms) showHint._t = setTimeout(() => el.classList.add("hidden"), ms);
}
export const hideHint = () => $("#modeHint").classList.add("hidden");
