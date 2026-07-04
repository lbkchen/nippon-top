// Friend maps: fork the map for a person without it going stale.
//
// Two fork modes:
//   exclude — "everything except…": new base recs flow in automatically (rebase on head)
//   include — "handpicked only": frozen list; manager shows how many new recs they're missing
// Plus per-place personal notes ("alice, this one's you") and pack extras — bonus
// spots/zones/ink that exist only on this friend's map.
// Shared via #for=<file>.<key>: the pack ships encrypted at friends/<file>.enc and the
// key never leaves the link. Works for friends once the pack is exported & pushed.
// Legacy #for=<slug> and #mix= links still parse.
import { $, esc, showHint, armCheck } from "./config.js";
import { map, PAD } from "./map.js";
import {
  state, allPlaces, placeById, allCurations, curationBySlug, curationVisibleIds,
  curationUnseenIds, upsertCuration, deleteCuration, uniqueSlug,
} from "./store.js";
import { packFetch, packLink } from "./pack.js";
import { emit, on } from "./bus.js";
import { setMode } from "./modes.js";

const shareLink = (cur) => (cur.file && cur.key ? packLink(cur) : `${location.href.split("#")[0]}#for=${cur.slug}`);
const shareHash = (cur) => (cur.file && cur.key ? `#for=${cur.file}.${cur.key}` : `#for=${cur.slug}`);

function downloadBlob(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- editing ----------
// An edit session survives tool switches: Ken can hop to add/zone/pen to make
// pack extras and come back. It ends only via save, nvm, or editing another map.
function startEdit(cur) {
  $("#curationsDrawer").classList.add("hidden");
  if (state.curationView) {
    // editing while a #for view is open would write to one map and show another
    history.replaceState(null, "", location.pathname + location.search);
    state.curationView = null;
    $("#curBanner").classList.add("hidden");
  }
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

function endEdit() {
  state.editingCuration = null;
  $("#curateBar").classList.add("hidden");
  emit("pack-changed"); // unsaved extras vanish with the edit
  if (state.mode === "curate") setMode(null);
  else emit("refresh");
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
  if ((cur.extraPlaces || []).some((p) => p.id === id)) {
    showHint("that's a bonus spot living on their map — delete it from its card if it's over", 2800);
    return;
  }
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
  const extras = new Set((cur.extraPlaces || []).map((p) => p.id));
  cur.mode = cur.mode === "exclude" ? "include" : "exclude";
  cur.ids = allPlaces()
    .filter((p) => !extras.has(p.id) && (cur.mode === "include" ? vis.has(p.id) : !vis.has(p.id)))
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
  upsertCuration(cur); // mints slug + file + key on first save
  endEdit();
  openManager();
  showHint(`${cur.name}'s map saved — export the pack to make their link live`, 3500);
}

function setNote({ id, text }) {
  const cur = state.editingCuration;
  if (!cur) return;
  cur.notes = cur.notes || {};
  if (text.trim()) cur.notes[id] = text.trim(); else delete cur.notes[id];
  emit("refresh-list");
}

// ---------- manager drawer ----------
async function fetchManifest() {
  try {
    const res = await fetch("friends/index.json", { cache: "no-cache" });
    if (res.ok) return await res.json();
  } catch { /* no manifest yet — nothing published */ }
  return [];
}

function managerRow(cur, published) {
  const row = document.createElement("div");
  row.className = "cur-row";
  const vis = curationVisibleIds(cur).size;
  const total = allPlaces().length;
  const notes = Object.keys(cur.notes || {}).length;
  const extras = (cur.extraPlaces?.length || 0) + (cur.extraZones?.length || 0) + (cur.extraDoodles?.length || 0);
  const unseen = curationUnseenIds(cur).length;
  const isPublished = !!cur.file && published.has(cur.file);
  const fresh = cur.mode === "exclude"
    ? '<span class="pill fresh" title="exclusion-based: it rebases on your latest recs automatically">auto-inherits new recs</span>'
    : unseen
      ? `<span class="pill stale" title="handpicked lists freeze — edit to review the new stuff">${unseen} new rec${unseen === 1 ? "" : "s"} since last edit</span>`
      : '<span class="pill fresh">up to date</span>';
  row.innerHTML = `
    <div class="cur-row-head">
      <span class="cur-row-name">${cur.emoji ? esc(cur.emoji) + " " : ""}${esc(cur.name)}</span>
      <span class="cur-row-stats">${vis}/${total} spots · ${cur.mode === "exclude" ? `hides ${cur.ids.length}` : `picked ${cur.ids.length}`}${notes ? ` · ${notes} note${notes === 1 ? "" : "s"}` : ""}${extras ? ` · ${extras} extra${extras === 1 ? "" : "s"}` : ""}</span>
    </div>
    ${cur.message ? `<div class="cur-row-msg">“${esc(cur.message)}”</div>` : ""}
    <div class="cur-row-pills">
      ${fresh}
      <span class="pill">updated ${esc(cur.updated || "—")}</span>
      ${isPublished ? "" : '<span class="pill warn" title="lives only in this browser — export the pack and push to make their link work">export to publish</span>'}
    </div>
    <div class="cur-row-actions">
      <button data-act="view">view</button>
      <button data-act="edit">edit</button>
      <button data-act="link">copy link</button>
      <button data-act="export" title="seal it into friends/${esc(cur.file || "…")}.enc">export pack</button>
      <button data-act="dupe">duplicate</button>
      <button data-act="del" title="${isPublished ? "removes your local copy — delete friends/" + esc(cur.file) + ".enc from the repo to kill the link too" : "gone forever"}">delete</button>
    </div>`;
  row.querySelector('[data-act="view"]').onclick = () => {
    $("#curationsDrawer").classList.add("hidden");
    location.hash = shareHash(cur);
  };
  row.querySelector('[data-act="edit"]').onclick = () => startEdit(structuredClone(cur));
  row.querySelector('[data-act="link"]').onclick = async (e) => {
    if (!cur.file || !cur.key) upsertCuration(cur); // mint keys for a pre-pack record
    try {
      await navigator.clipboard.writeText(shareLink(cur));
      e.target.textContent = "copied!";
      setTimeout(() => { e.target.textContent = "copy link"; }, 1500);
    } catch {
      console.log("friend link:", shareLink(cur));
      showHint("clipboard said no — the link is in the console", 3000);
    }
  };
  row.querySelector('[data-act="export"]').onclick = () => {
    if (!cur.file || !cur.key) upsertCuration(cur);
    emit("export-pack", { slug: cur.slug });
  };
  row.querySelector('[data-act="dupe"]').onclick = () => {
    const copy = structuredClone(cur);
    copy.name = `${cur.name} 2`;
    copy.slug = uniqueSlug(copy.name);
    copy.file = null; // the twin gets its own blob + link
    copy.key = null;
    upsertCuration(copy);
    openManager();
  };
  row.querySelector('[data-act="del"]').onclick = (e) => {
    if (!armCheck(e.target, isPublished ? "local copy only?" : "their link dies?")) return;
    deleteCuration(cur.slug);
    openManager();
  };
  return row;
}

// a pack that's published but unknown to this browser — the link is the way back in
function ghostRow(entry) {
  const row = document.createElement("div");
  row.className = "cur-row ghost";
  row.innerHTML = `
    <div class="cur-row-head">
      <span class="cur-row-name">${esc(entry.name || entry.file)}</span>
      <span class="cur-row-stats">published ${esc(entry.updated || "")}</span>
    </div>
    <div class="cur-row-pills">
      <span class="pill" title="this browser doesn't hold the key — the share link does">locked — open their link here to adopt it</span>
    </div>`;
  return row;
}

async function openManager() {
  const body = $("#curationsBody");
  const curs = allCurations();
  const manifest = await fetchManifest();
  const published = new Set(manifest.map((e) => e.file));
  body.innerHTML = "";
  if (!curs.length && !manifest.length) {
    body.innerHTML = '<div class="empty-state"><span class="big">✉︎</span>no friend maps yet —<br>fork one for someone with taste</div>';
  } else {
    for (const c of curs) body.append(managerRow(c, published));
    const local = new Set(curs.map((c) => c.file));
    for (const e of manifest) if (!local.has(e.file)) body.append(ghostRow(e));
  }
  $("#curationsDrawer").classList.remove("hidden");
}

function downloadKeyring() {
  const rows = allCurations()
    .filter((c) => c.file && c.key)
    .map((c) => ({ name: c.name, slug: c.slug, file: c.file, key: c.key, link: shareLink(c) }));
  if (!rows.length) return showHint("no keys yet — save a friend map first", 2500);
  downloadBlob("nippon-keyring.json", new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
  showHint("keyring downloaded — stash it somewhere your future self can find", 3200);
}

// ---------- viewer (#for=<file>.<key>, legacy #for=<slug> and #mix=) ----------
function parseHash() {
  let m = location.hash.match(/^#for=([\w-]+)\.([A-Za-z0-9_-]{16,})$/);
  if (m) return { file: m[1], key: m[2] };
  m = location.hash.match(/^#for=([\w-]+)$/); // legacy plain-slug links (pre-pack)
  if (m) return { cur: curationBySlug(decodeURIComponent(m[1])) || null };
  m = location.hash.match(/^#mix=([^~]+)~(.+)$/); // legacy mixtape links
  if (m) {
    const ids = m[2].split(".").filter((id) => placeById(id));
    return ids.length ? { cur: { slug: null, name: decodeURIComponent(m[1]), emoji: "", message: "", mode: "include", ids, notes: {} } } : null;
  }
  return null;
}

export async function enterHashView() {
  const h = parseHash();
  let cur = h?.cur ?? null;
  let failed = false;
  let fetched = false;
  if (h?.file) {
    // local copy first: Ken sees his freshest edits, and it works offline
    cur = allCurations().find((c) => c.file === h.file) || null;
    if (!cur) {
      try {
        cur = await packFetch(h.file, h.key);
        cur.file = h.file;
        cur.key = h.key;
        fetched = true;
      } catch { failed = true; }
    }
  }
  state.curationView = cur;
  emit("pack-changed");
  $("#curBanner").classList.toggle("hidden", !cur && !failed);
  const adopt = $("#curBannerAdopt");
  adopt.classList.add("hidden");
  if (failed) {
    $("#curBannerText").innerHTML = "this friend map wouldn't open — mangled link, missing pack, or the wifi shrugged. poke whoever sent it.";
    $("#curBannerMsg").classList.add("hidden");
  } else if (cur) {
    const vis = curationVisibleIds(cur);
    $("#curBannerText").innerHTML = `${cur.emoji ? esc(cur.emoji) + " " : ""}a hand-rolled japan map for <b>${esc(cur.name)}</b> — ${vis.size} spots, curated with love`;
    $("#curBannerMsg").textContent = cur.message || "";
    $("#curBannerMsg").classList.toggle("hidden", !cur.message);
    const pts = [...vis].map((id) => placeById(id)).filter(Boolean).map((p) => [p.lat, p.lng]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), PAD());
    if (fetched) {
      // pack came off the wire and this browser doesn't manage it — offer to adopt
      // (this is also Ken's whole recovery story on a new browser: open link, adopt)
      adopt.classList.remove("hidden");
      adopt.onclick = () => {
        upsertCuration(structuredClone(cur));
        adopt.classList.add("hidden");
        showHint(`${cur.name}'s map adopted — it's in your friend maps drawer now`, 3200);
      };
    }
  }
  emit("refresh");
}

export function initCurations() {
  on("open-curations", openManager);
  on("mix-toggle", toggleId);
  on("curation-note-set", setNote);
  on("mode-changed", (m) => {
    // the bar belongs to the edit session, not the tool — it survives mode hops
    $("#curateBar").classList.toggle("hidden", !state.editingCuration);
    $("#curPick").classList.toggle("hidden", !state.editingCuration || m === "curate");
  });

  $("#curationsClose").onclick = () => $("#curationsDrawer").classList.add("hidden");
  $("#curationsNew").onclick = () => startEdit({ slug: null, name: "", emoji: "", message: "", mode: "exclude", ids: [], notes: {}, extraPlaces: [], extraZones: [], extraDoodles: [] });
  $("#curKeyring").onclick = downloadKeyring;
  $("#curSave").onclick = saveEdit;
  $("#curCancel").onclick = endEdit;
  $("#curPick").onclick = () => setMode("curate");
  $("#curMode").onclick = switchEditMode;
  $("#curName").addEventListener("change", () => emit("refresh-list"));
  $("#curBannerShowAll").onclick = () => {
    history.replaceState(null, "", location.pathname + location.search);
    enterHashView();
  };
  window.addEventListener("hashchange", enterHashView);
}
