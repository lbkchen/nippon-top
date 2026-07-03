// Friend packs: a whole friend map (picks, notes, extra spots/zones/ink) sealed
// into one encrypted blob at friends/<file>.enc. The AES key rides in the share
// link's hash — the repo is public, the pack is not. Leaf util: no app imports.
//
// Wire format: JSON → deflate-raw → AES-GCM(128) → [12-byte IV][ciphertext].
// Wrong key or tampered bytes = clean throw (GCM authenticates), never garbage.

// ---------- base64url (links + localStorage cache) ----------
export function b64uEncode(bytes) {
  let s = "";
  // chunked: spreading a doodle-heavy pack into fromCharCode blows the stack
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64uDecode(s) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

export const generateKey = () => b64uEncode(crypto.getRandomValues(new Uint8Array(16)));

// short random tail for pack filenames: alice → alice-x7k2m9
export function randomSuffix(len = 6) {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...crypto.getRandomValues(new Uint8Array(len))].map((b) => abc[b % abc.length]).join("");
}

// ---------- codec ----------
const pipe = async (bytes, Transform) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Transform("deflate-raw"))).arrayBuffer());

const importKey = (keyB64, use) => crypto.subtle.importKey("raw", b64uDecode(keyB64), "AES-GCM", false, [use]);

export async function packEncode(cur, keyB64) {
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(cur)), CompressionStream);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(keyB64, "encrypt"), plain));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}

export async function packDecode(bytes, keyB64) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) }, await importKey(keyB64, "decrypt"), bytes.subarray(12),
  );
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(plain), DecompressionStream)));
}

// ---------- fetch + last-good cache ----------
// localStorage here is strictly a cache: a fresh browser refetches from the link,
// a cleared one loses nothing. Keeps friend maps working on shinkansen wifi.
const cacheKey = (file) => `nippon_pack_${file}`;

export async function packFetch(file, keyB64) {
  let bytes = null;
  try {
    const res = await fetch(`friends/${encodeURIComponent(file)}.enc`, { cache: "no-cache" });
    if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
  } catch { /* offline — fall back to cache below */ }
  if (bytes) {
    const cur = await packDecode(bytes, keyB64); // throws before caching junk
    try { localStorage.setItem(cacheKey(file), b64uEncode(bytes)); } catch { /* cache is best-effort */ }
    return cur;
  }
  const cached = localStorage.getItem(cacheKey(file));
  if (cached) return packDecode(b64uDecode(cached), keyB64);
  throw new Error("pack-unreachable");
}

export const packLink = (cur) => `${location.href.split("#")[0]}#for=${cur.file}.${cur.key}`;
