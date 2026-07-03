// Friend maps: fork the map for a person without it going stale.
//
// Two fork modes:
//   exclude — "everything except…": new base recs flow in automatically (rebase on head)
//   include — "handpicked only": frozen list; manager shows how many new recs they're missing
// Plus per-place personal notes ("alice, this one's you").
// Shared via #for=<slug>; the link works for friends once data.js is exported & published.
import { $, esc, showHint } from "./config.js";
import { map, PAD } from "./map.js";
import {
  state, allPlaces, placeById, allCurations, curationBySlug, curationVisibleIds,
  curationUnseenIds, upsertCuration, deleteCuration, BASE,
} from "./store.js";
import { emit, on } from "./bus.js";
import { setMode } from "./modes.js";

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "friend";

function uniqueSlug(name) {
  const taken = new Set(allCurations().map((c) => c.slug));
  const base = slugify(name);
  let out = base, i = 2;
  while (taken.has(out)) out = `${base}-${i++}`;
  return out;
}

const curLink = (cur) => `${location.href.split("#")[0]}#for=${cur.slug}`;

// ---------- editing ----------
function startEdit(cur) {
  $("#curationsDrawer").classList.add("hidden");
  state.editingCuration = cur;
  $("#curName").value = cur.name || "";
  $("#curEmoji").value = cur.emoji || "";
  $("#curMessage").value = cur.message || "";
  emit("pack-changed"); // the pack's extra zones/ink come into view
  if (state.mode !== "curate") setMode("curate");
  else emit("refresh");
  updateEditUI();
  emit("open-sidebar");
}

function updateEditUI() {
  const cur = state.editingCuration;
  if (!cur) return;
  $("#curCount").textContent = `${curationVisibleIds(cur).size} in`;
  const modeBtn = $("#curMode");
  modeBtn.textContent = cur.mode === "exclude" ? "everything except…" : "handpicked only";
  modeBtn.title = cur.mode === "exclude"
    ? "future recs auto-appear on their map — click to switch to handpicked"
    : "frozen to these picks — future recs won't auto-appear — click to switch";
}

function toggleId(id) {
  const cur = state.editingCuration;
  if (!cur) return;
  const i = cur.ids.indexOf(id);
  if (i >= 0) cur.ids.splice(i, 1); else cur.ids.push(id);
  updateEditUI();
  emit("refresh");
}

// flip exclude<->include while preserving what's currently visible
function switchEditMode() {
  const cur = state.editingCuration;
  if (!cur) return;
  const vis = curationVisibleIds(cur);
  cur.mode = cur.mode === "exclude" ? "include" : "exclude";
  cur.ids = allPlaces()
    .filter((p) => (cur.mode === "include" ? vis.has(p.id) : !vis.has(p.id)))
    .map((p) => p.id);
  updateEditUI();
  emit("refresh");
}

function saveEdit() {
  const cur = state.editingCuration;
  if (!cur) return;
  cur.name = $("#curName").value.trim() || "a friend with taste";
  cur.emoji = $("#curEmoji").value.trim();
  cur.message = $("#curMessage").value.trim();
  cur.slug = cur.slug || uniqueSlug(cur.name);
  upsertCuration(cur);
  state.editingCuration = null;
  setMode(null);
  openManager();
  showHint(`${cur.name}'s map saved — copy their link from friend maps`, 3500);
}

function setNote({ id, text }) {
  const cur = state.editingCuration;
  if (!cur) return;
  cur.notes = cur.notes || {};
  if (text.trim()) cur.notes[id] = text.trim(); else delete cur.notes[id];
  emit("refresh-list");
}

// ---------- manager drawer ----------
function managerRow(cur) {
  const row = document.createElement("div");
  row.className = "cur-row";
  const vis = curationVisibleIds(cur).size;
  const total = allPlaces().length;
  const notes = Object.keys(cur.notes || {}).length;
  const unseen = curationUnseenIds(cur).length;
  const exported = BASE.curations.some((b) => b.slug === cur.slug);
  const fresh = cur.mode === "exclude"
    ? '<span class="pill fresh" title="exclusion-based: it rebases on your latest recs automatically">auto-inherits new recs</span>'
    : unseen
      ? `<span class="pill stale" title="handpicked lists freeze — edit to review the new stuff">${unseen} new rec${unseen === 1 ? "" : "s"} since last edit</span>`
      : '<span class="pill fresh">up to date</span>';
  row.innerHTML = `
    <div class="cur-row-head">
      <span class="cur-row-name">${cur.emoji ? esc(cur.emoji) + " " : ""}${esc(cur.name)}</span>
      <span class="cur-row-stats">${vis}/${total} spots · ${cur.mode === "exclude" ? `hides ${cur.ids.length}` : `picked ${cur.ids.length}`}${notes ? ` · ${notes} note${notes === 1 ? "" : "s"}` : ""}</span>
    </div>
    ${cur.message ? `<div class="cur-row-msg">“${esc(cur.message)}”</div>` : ""}
    <div class="cur-row-pills">
      ${fresh}
      <span class="pill">updated ${esc(cur.updated || "—")}</span>
      ${exported ? "" : '<span class="pill warn" title="lives only in this browser — export and publish to make the link work for them">export to publish</span>'}
    </div>
    <div class="cur-row-actions">
      <button data-act="view">view</button>
      <button data-act="edit">edit</button>
      <button data-act="link">copy link</button>
      <button data-act="dupe">duplicate</button>
      <button data-act="del" title="${exported ? "removes your local edits (the exported version stays)" : "gone forever"}">delete</button>
    </div>`;
  row.querySelector('[data-act="view"]').onclick = () => {
    $("#curationsDrawer").classList.add("hidden");
    location.hash = `#for=${cur.slug}`;
  };
  row.querySelector('[data-act="edit"]').onclick = () => startEdit(structuredClone(cur));
  row.querySelector('[data-act="link"]').onclick = async (e) => {
    try {
      await navigator.clipboard.writeText(curLink(cur));
      e.target.textContent = "copied!";
      setTimeout(() => { e.target.textContent = "copy link"; }, 1500);
    } catch { prompt("copy this:", curLink(cur)); }
  };
  row.querySelector('[data-act="dupe"]').onclick = () => {
    const copy = structuredClone(cur);
    copy.name = `${cur.name} 2`;
    copy.slug = uniqueSlug(copy.name);
    upsertCuration(copy);
    openManager();
  };
  row.querySelector('[data-act="del"]').onclick = () => {
    if (!confirm(`delete ${cur.name}'s map?${exported ? " (your local edits only — re-export to truly remove it)" : " their link will stop working."}`)) return;
    deleteCuration(cur.slug);
    openManager();
  };
  return row;
}

function openManager() {
  const body = $("#curationsBody");
  body.innerHTML = "";
  const curs = allCurations();
  if (!curs.length) {
    body.innerHTML = '<div class="empty-state"><span class="big">✉︎</span>no friend maps yet —<br>fork one for someone with taste</div>';
  } else {
    for (const c of curs) body.append(managerRow(c));
  }
  $("#curationsDrawer").classList.remove("hidden");
}

// ---------- viewer (#for=slug, legacy #mix=) ----------
function parseHash() {
  let m = location.hash.match(/^#for=([\w-]+)$/);
  if (m) return curationBySlug(decodeURIComponent(m[1])) || null;
  m = location.hash.match(/^#mix=([^~]+)~(.+)$/); // legacy mixtape links
  if (m) {
    const ids = m[2].split(".").filter((id) => placeById(id));
    return ids.length ? { slug: null, name: decodeURIComponent(m[1]), emoji: "", message: "", mode: "include", ids, notes: {} } : null;
  }
  return null;
}

export function enterHashView() {
  const cur = parseHash();
  state.curationView = cur;
  emit("pack-changed");
  $("#curBanner").classList.toggle("hidden", !cur);
  if (cur) {
    const vis = curationVisibleIds(cur);
    $("#curBannerText").innerHTML = `${cur.emoji ? esc(cur.emoji) + " " : ""}a hand-rolled japan map for <b>${esc(cur.name)}</b> — ${vis.size} spots, curated with love`;
    $("#curBannerMsg").textContent = cur.message || "";
    $("#curBannerMsg").classList.toggle("hidden", !cur.message);
    const pts = [...vis].map((id) => { const p = placeById(id); return [p.lat, p.lng]; });
    if (pts.length) map.fitBounds(L.latLngBounds(pts), PAD());
  }
  emit("refresh");
}

export function initCurations() {
  on("open-curations", openManager);
  on("mix-toggle", toggleId);
  on("curation-note-set", setNote);
  on("mode-changed", (m) => {
    $("#curateBar").classList.toggle("hidden", m !== "curate");
    if (m !== "curate" && state.editingCuration) {
      state.editingCuration = null;
      emit("pack-changed"); // unsaved extras vanish with the edit
    }
  });

  $("#curationsClose").onclick = () => $("#curationsDrawer").classList.add("hidden");
  $("#curationsNew").onclick = () => startEdit({ slug: null, name: "", emoji: "", message: "", mode: "exclude", ids: [], notes: {} });
  $("#curSave").onclick = saveEdit;
  $("#curCancel").onclick = () => setMode(null);
  $("#curMode").onclick = switchEditMode;
  $("#curName").addEventListener("change", () => emit("refresh-list"));
  $("#curBannerShowAll").onclick = () => {
    history.replaceState(null, "", location.pathname + location.search);
    enterHashView();
  };
  window.addEventListener("hashchange", enterHashView);
}
