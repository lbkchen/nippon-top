// Bake in-browser edits back into files you can commit.
//   export       — data.js (places/zones/doodles; friend maps ship separately)
//   export-pack  — one friend map sealed into friends/<file>.enc + updated manifest.
//                  In dev both save straight into the repo via serve.mjs PUT;
//                  otherwise they download for a manual drop into friends/.
import { showHint, DEV } from "./config.js";
import { mergedData, allCurations, BASE } from "./store.js";
import { packEncode } from "./pack.js";
import { on } from "./bus.js";

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportData() {
  const out = `// NIPPON TOP data — exported ${new Date().toISOString().slice(0, 10)} from the app itself.\nwindow.NIPPON = ${JSON.stringify(mergedData(), null, 2)};\n`;
  download("data.js", new Blob([out], { type: "text/javascript" }));
  showHint("drop that data.js into the repo — your edits are now canon", 3500);
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
};
