#!/usr/bin/env node
// Sanity-checks data.js so a bad export/edit can't ship a broken map.
//   node tools/check-data.mjs        (exit 1 on any failure)
import { readFileSync } from "node:fs";
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

const { places = [], chains = [], zones = [], curations = [], doodles = [] } = data;

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
  if (!Array.isArray(z.points) || z.points.length < 3) err(`${tag}: needs ≥3 points`);
  else for (const pt of z.points) {
    if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== "number") { err(`${tag}: malformed point`); break; }
  }
}

// ---- curations ----
const slugs = new Set();
for (const c of curations) {
  const tag = `curation "${c.slug || c.name || "???"}"`;
  if (!c.slug || !/^[\w-]+$/.test(c.slug)) err(`${tag}: slug must be url-safe ([\\w-]+)`);
  if (slugs.has(c.slug)) err(`${tag}: duplicate slug`);
  slugs.add(c.slug);
  if (!c.name) err(`${tag}: missing name`);
  if (!["exclude", "include"].includes(c.mode)) err(`${tag}: mode must be exclude|include`);
  for (const id of c.ids || []) if (!ids.has(id)) err(`${tag}: references unknown place "${id}"`);
  for (const id of Object.keys(c.notes || {})) if (!ids.has(id)) err(`${tag}: note on unknown place "${id}"`);
  for (const id of c.seen || []) if (!ids.has(id)) err(`${tag}: seen list has unknown place "${id}"`);
}

// ---- doodles ----
for (const [i, d] of doodles.entries()) {
  if (!/^#[0-9a-f]{6}$/i.test(d.color || "")) err(`doodle #${i}: color must be #rrggbb`);
  if (!Array.isArray(d.pts) || d.pts.length < 2) err(`doodle #${i}: needs ≥2 points`);
}

// ---- verdict ----
if (errors.length) {
  console.error(`✗ data.js has ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}
console.log(`✓ data.js looks extremely correct — ${places.length} places (${places.filter((p) => p.star).length} bangers), ${chains.length} chains, ${zones.length} zones, ${curations.length} friend maps, ${doodles.length} doodles`);
