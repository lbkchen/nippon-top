#!/usr/bin/env node
// Zero-dependency static server with no-cache headers, so edits always show up.
// Also accepts PUT /img/<file> (dev-only photo drop) and PUT /friends/<file>
// (friend-pack export) so the app can save straight into the repo
// (localhost only — the server never binds beyond 127.0.0.1).
//   node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, extname, normalize, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".enc": "application/octet-stream",
};

async function readBody(req, res, cap) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > cap) { res.writeHead(413).end("too big"); return null; }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (req.method === "PUT" && path.startsWith("/img/")) {
      const name = basename(path);
      if (!/^[\w.-]+\.(jpe?g|png|webp|avif)$/i.test(name)) { res.writeHead(400).end("bad filename"); return; }
      const body = await readBody(req, res, 15e6);
      if (!body) return;
      await writeFile(join(ROOT, "img", name), body);
      console.log(`  📷 saved img/${name} (${Math.round(body.length / 1024)} kB)`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, file: name }));
      return;
    }
    if (req.method === "PUT" && path.startsWith("/friends/")) {
      const name = basename(path);
      if (!/^([\w-]+\.enc|index\.json)$/.test(name)) { res.writeHead(400).end("bad filename"); return; }
      const body = await readBody(req, res, 5e6);
      if (!body) return;
      await mkdir(join(ROOT, "friends"), { recursive: true });
      await writeFile(join(ROOT, "friends", name), body);
      console.log(`  ✉︎ saved friends/${name} (${Math.round(body.length / 1024) || 1} kB)`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, file: name }));
      return;
    }
    // GET /gmaps?url=<shortlink> — expand a google maps shortlink and pull the
    // exact marker coords out of the resolved URL. Dev-only convenience (the
    // browser can't follow cross-origin redirects itself); host-allowlisted,
    // localhost-bound, so not a general-purpose proxy.
    if (req.method === "GET" && path === "/gmaps") {
      const target = new URL(req.url, "http://x").searchParams.get("url") || "";
      if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)\//i.test(target)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not a google maps link" }));
        return;
      }
      try {
        const r = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (nippon-top dev)" } });
        let u = r.url;
        try { u = decodeURIComponent(u); } catch { /* keep raw */ }
        const pin = [...u.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)].pop();
        const m = pin || u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        console.log(`  📍 gmaps resolve ${m ? "hit" : "miss"}: ${target}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(m ? { lat: +m[1], lng: +m[2] } : { miss: true }));
      } catch {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "couldn't reach google" }));
      }
      return;
    }
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 — not on the map");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`🗾 NIPPON TOP → http://localhost:${PORT}`));
