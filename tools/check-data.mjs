#!/usr/bin/env node
// Sanity-checks data.js (and the friends/ pack manifest) so a bad export/edit
// can't ship a broken map.
//   node tools/check-data.mjs        (exit 1 on any failure)
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATS = ["food", "cafe", "night", "temple", "park", "hood", "shop", "museum", "view", "trip", "onsen", "fun"];
const GROUPS = ["tokyo", "neartokyo", "kyoto", "osaka", "hiroshima", "hokkaido"];
// generous Japan bounding box — catches swapped/garbage coords, not border disputes
const JP = { latMin: 24, latMax: 46, lngMin: 122, lngMax: 154 };

const errors = [];
const err = (msg) => errors.push(msg);

// data.js assigns window.NIPPON — evaluate it with a stub window
const src = readFileSync(join(ROOT, "data.js"), "utf8");
const w = {};
new Function("window", src)(w);
const data = w.NIPPON;

if (!data) { console.error("✗ data.js did not set window.NIPPON"); process.exit(1); }

const { places = [], chains = [], zones = [], doodles = [] } = data;

// ---- places ----
const ids = new Set();
for (const p of places) {
  const tag = `place "${p.id || p.name || "???"}"`;
  if (!p.id) err(`${tag}: missing id`);
  if (ids.has(p.id)) err(`${tag}: duplicate id`);
  ids.add(p.id);
  if (!p.name) err(`${tag}: missing name`);
  if (!p.region) err(`${tag}: missing region`);
  if (!CATS.includes(p.cat)) err(`${tag}: unknown cat "${p.cat}"`);
  if (!GROUPS.includes(p.group)) err(`${tag}: unknown group "${p.group}"`);
  if (typeof p.star !== "boolean") err(`${tag}: star must be boolean`);
  if (typeof p.lat !== "number" || typeof p.lng !== "number") err(`${tag}: lat/lng must be numbers`);
  else if (p.lat < JP.latMin || p.lat > JP.latMax || p.lng < JP.lngMin || p.lng > JP.lngMax)
    err(`${tag}: coords [${p.lat}, ${p.lng}] are not in Japan — did lat/lng get swapped?`);
  if (typeof p.notes !== "string") err(`${tag}: notes must be a string (empty is fine)`);
  if (p.photo != null) {
    if (typeof p.photo !== "string" || !/\.(jpe?g|png|webp|avif)$/i.test(p.photo)) err(`${tag}: photo must be an image filename in img/`);
    else if (!existsSync(join(ROOT, "img", p.photo))) err(`${tag}: img/${p.photo} does not exist`);
  }
  if (p.gmaps != null && !/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)\//i.test(p.gmaps))
    err(`${tag}: gmaps must be a https google maps link (got "${String(p.gmaps).slice(0, 40)}…")`);
}

// ---- chains ----
for (const c of chains) {
  if (!c.name) err("chain with no name");
  if (typeof c.notes !== "string") err(`chain "${c.name}": notes must be a string`);
}

// ---- zones ----
const zoneIds = new Set();
for (const z of zones) {
  const tag = `zone "${z.name || z.id || "???"}"`;
  if (!z.id || zoneIds.has(z.id)) err(`${tag}: missing or duplicate id`);
  zoneIds.add(z.id);
  if (!z.name) err(`${tag}: missing name`);
  if (!/^#[0-9a-f]{6}$/i.test(z.color || "")) err(`${tag}: color must be #rrggbb`);
  if (z.fill != null && !["dots", "hatch"].includes(z.fill)) err(`${tag}: fill must be dots|hatch (or absent for solid)`);
  if (!Array.isArray(z.points) || z.points.length < 3) err(`${tag}: needs ≥3 points`);
  else for (const pt of z.points) {
    if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== "number") { err(`${tag}: malformed point`); break; }
  }
}

// ---- friend packs ----
// Packs are encrypted (contents get sanity-checked at export time, in the app) —
// CI can only verify the manifest and the blobs agree, so no friend link 404s silently.
let packCount = 0;
const friendsDir = join(ROOT, "friends");
if (existsSync(friendsDir)) {
  const encFiles = readdirSync(friendsDir).filter((f) => f.endsWith(".enc"));
  packCount = encFiles.length;
  let manifest = [];
  const mPath = join(friendsDir, "index.json");
  if (existsSync(mPath)) {
    try { manifest = JSON.parse(readFileSync(mPath, "utf8")); } catch { err("friends/index.json: does not parse"); }
  } else if (encFiles.length) {
    err("friends/ has packs but no index.json — the manager can't list them");
  }
  if (!Array.isArray(manifest)) { err("friends/index.json: must be an array"); manifest = []; }
  const listed = new Set();
  for (const e of manifest) {
    const tag = `friends manifest "${e.name || e.file || "???"}"`;
    if (!e.file || !/^[\w-]+$/.test(e.file)) { err(`${tag}: bad or missing file id`); continue; }
    if (!e.name) err(`${tag}: missing name`);
    if (listed.has(e.file)) err(`${tag}: duplicate file id`);
    listed.add(e.file);
    if (!encFiles.includes(`${e.file}.enc`)) err(`${tag}: friends/${e.file}.enc is missing — that link is dead`);
  }
  for (const f of encFiles) {
    if (!listed.has(f.replace(/\.enc$/, ""))) err(`friends/${f}: not in index.json — export it again from the app`);
  }
}

// ---- doodles (ink strokes + text/stamp stickers share the array) ----
const STAMP_KINDS = [
  "itadaki", "banger", "heart", "nope",
  "ramen", "onigiri", "kanpai", "camera",
  "torii", "onsen", "fuji", "sakura",
  "go", "densha", "neko", "yen",
];
for (const [i, d] of doodles.entries()) {
  const tag = `doodle #${i}${d.type ? ` (${d.type})` : ""}`;
  if (!/^#[0-9a-f]{6}$/i.test(d.color || "")) err(`${tag}: color must be #rrggbb`);
  if (d.type === "text" || d.type === "stamp") {
    if (!Array.isArray(d.at) || d.at.length !== 2 || typeof d.at[0] !== "number") err(`${tag}: needs at: [lat, lng]`);
    if (d.type === "text" && !(d.text || "").trim()) err(`${tag}: empty text sticker`);
    if (d.type === "stamp" && !STAMP_KINDS.includes(d.kind)) err(`${tag}: unknown stamp kind "${d.kind}"`);
    if (d.s != null && !(typeof d.s === "number" && d.s >= 0.2 && d.s <= 5)) err(`${tag}: size s must be a number in [0.2, 5]`);
  } else if (!Array.isArray(d.pts) || d.pts.length < 2) {
    err(`${tag}: needs ≥2 points`);
  }
}

// ---- verdict ----
if (errors.length) {
  console.error(`✗ data.js has ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}
console.log(`✓ data.js looks extremely correct — ${places.length} places (${places.filter((p) => p.star).length} bangers), ${chains.length} chains, ${zones.length} zones, ${doodles.length} doodles, ${packCount} friend pack${packCount === 1 ? "" : "s"}`);
