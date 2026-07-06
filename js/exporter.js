// Bake in-browser edits back into files you can commit.
//   export       — dev: one-click publish (serve.mjs commits + pushes = live for
//                  everyone in ~a minute); prod: downloads data.js for a manual drop.
//   export-pack  — one friend map sealed into friends/<file>.enc + updated manifest.
//                  In dev both save straight into the repo via serve.mjs PUT;
//                  otherwise they download for a manual drop into friends/.
import { $, showHint, DEV, armCheck } from "./config.js";
import { mergedData, allCurations, BASE, pendingCount } from "./store.js";
import { packEncode } from "./pack.js";
import { on } from "./bus.js";

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const dataFileText = () =>
  `// NIPPON TOP data — exported ${new Date().toISOString().slice(0, 10)} from the app itself.\nwindow.NIPPON = ${JSON.stringify(mergedData(), null, 2)};\n`;

function exportData() {
  if (DEV) return publish();
  download("data.js", new Blob([dataFileText()], { type: "text/javascript" }));
  showHint("drop that data.js into the repo — your edits are now canon", 3500);
}

// ---- one-click publish (dev) ----
// serve.mjs builds the commit in a throwaway worktree from origin/main and
// pushes — works no matter what branch/mess the local checkout is in.
// keep djb2 in sync with serve.mjs
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
let bootHash = null; // data.js as this page booted from — server compares it to origin/main's
let publishing = false;

async function publish() {
  if (publishing) return;
  const btn = $('#toolbar [data-tool="export"]');
  if (btn && !armCheck(btn, "ship it to everyone?")) return;

  publishing = true;
  showHint("publishing…");
  try {
    const sent = dataFileText();
    const res = await fetch("publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: sent, summary: editSummary(), baseHash: bootHash }),
    });
    const r = await res.json();
    if (r.ok && r.nothing) showHint("nothing new to ship — the map is already canon", 3200);
    else if (r.ok && r.synced) {
      showHint(`pushed ${r.commit} — live for everyone in ~a minute. freshening up…`, 3200);
      setTimeout(() => location.reload(), 1600); // reload prunes the overlays against the new base
    } else if (r.ok) {
      // shipped, but the local checkout (feature branch / mid-something) didn't
      // get the commit — the badge stays until the repo catches up, on purpose.
      // origin/main is now byte-for-byte what we sent, so adopt it as our base:
      // publishing again says "nothing new" instead of tripping the stale guard
      bootHash = hash(sent);
      showHint(`pushed ${r.commit} — live in ~a minute. local repo is on "${r.branch}", so the badge sticks around till you git pull on main`, 6500);
    } else {
      showHint(`publish hiccup: ${r.error}`, 6500);
    }
  } catch {
    showHint("couldn't reach the dev server — falling back to a plain download", 3600);
    download("data.js", new Blob([dataFileText()], { type: "text/javascript" }));
  } finally {
    publishing = false;
  }
}

// "2 spots, 1 pin fix" — rides into the commit message
function editSummary() {
  const d = mergedData();
  const custom = d.places.filter((p) => String(p.id).startsWith("custom-")).length;
  const parts = [];
  if (custom) parts.push(`${custom} new spot${custom === 1 ? "" : "s"}`);
  const rest = pendingCount() - custom;
  if (rest > 0) parts.push(`${rest} edit${rest === 1 ? "" : "s"}`);
  return parts.join(", ");
}

// ---- unpublished-edits badge on the export tool ----
function refreshBadge() {
  const btn = $('#toolbar [data-tool="export"]');
  if (!btn) return;
  const n = pendingCount();
  let badge = btn.querySelector(".tool-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "tool-badge";
    btn.append(badge);
  }
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.toggle("hidden", n === 0);
  const label = btn.querySelector(".tool-label");
  if (label && !btn.dataset.armed) {
    label.textContent = DEV
      ? (n ? `publish ${n} edit${n === 1 ? "" : "s"}` : "publish")
      : (n ? `export ${n} edit${n === 1 ? "" : "s"}` : "export");
  }
  btn.setAttribute("aria-label", DEV
    ? "publish — commit + push your edits, live for everyone"
    : (n ? `export — ${n} edit${n === 1 ? "" : "s"} only you can see until you export + push` : "export — download data.js with your edits baked in"));
}

// the pack rides encrypted, so CI can't inspect it — sanity checks live here instead
function packWarnings(cur) {
  const known = new Set([...BASE.places.map((p) => p.id), ...(cur.extraPlaces || []).map((p) => p.id)]);
  const dangling = new Set();
  if (cur.mode === "include") for (const id of cur.ids) if (!known.has(id)) dangling.add(id);
  for (const id of Object.keys(cur.notes || {})) if (!known.has(id)) dangling.add(id);
  return dangling.size;
}

async function putFile(path, blob) {
  const res = await fetch(path, { method: "PUT", body: blob });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
}

async function currentManifest() {
  try {
    const res = await fetch("friends/index.json", { cache: "no-cache" });
    if (res.ok) return await res.json();
  } catch { /* first pack ever */ }
  return [];
}

async function exportPack({ slug }) {
  const cur = allCurations().find((c) => c.slug === slug);
  if (!cur) return;
  if (!cur.file || !cur.key) return showHint("save this map once first — it needs its link minted", 3000);

  const dangling = packWarnings(cur);
  if (dangling) showHint(`heads up: ${dangling} spot${dangling === 1 ? "" : "s"} in ${cur.name}'s map aren't in the published data.js — export data too`, 4500);

  // strip the key before sealing: it must only ever live in the link (and the keyring)
  const { key, ...packContents } = cur;
  const bytes = await packEncode({ v: 1, ...packContents }, key);
  const encBlob = new Blob([bytes], { type: "application/octet-stream" });

  const manifest = (await currentManifest()).filter((e) => e.file !== cur.file);
  manifest.push({ name: cur.name, file: cur.file, updated: cur.updated });
  manifest.sort((a, b) => a.name.localeCompare(b.name));
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2) + "\n"], { type: "application/json" });

  if (DEV) {
    try {
      await putFile(`friends/${cur.file}.enc`, encBlob);
      await putFile("friends/index.json", manifestBlob);
      showHint(`sealed friends/${cur.file}.enc (${Math.round(bytes.length / 1024) || 1} kB) — commit + push and their link is live`, 4000);
    } catch {
      showHint("couldn't save — pack export needs the dev server (node tools/serve.mjs)", 3800);
    }
  } else {
    download(`${cur.file}.enc`, encBlob);
    download("index.json", manifestBlob);
    showHint("downloaded the pack + manifest — both go into friends/ in the repo", 4200);
  }
}

export const initExporter = () => {
  on("export", exportData);
  on("export-pack", exportPack);
  on("dirty", refreshBadge);
  on("refresh", refreshBadge); // deletes/undo change the count without an lsSet in this tab
  refreshBadge();
  // remember what the map looked like at boot, for the stale-page guard
  if (DEV) fetch("data.js", { cache: "no-store" }).then((r) => r.text()).then((t) => { bootHash = hash(t); }).catch(() => {});
};
