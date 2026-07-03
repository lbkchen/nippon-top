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
  zones: "nippon_custom_zones",
  curations: "nippon_custom_curations",
};

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
