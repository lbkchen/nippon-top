#!/usr/bin/env node
// Zero-dependency static server with no-cache headers, so edits always show up.
// Also accepts PUT /img/<file> so the app's dev-only photo drop can save files
// straight into img/ (localhost only — the server never binds beyond 127.0.0.1).
//   node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
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
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (req.method === "PUT" && path.startsWith("/img/")) {
      const name = basename(path);
      if (!/^[\w.-]+\.(jpe?g|png|webp|avif)$/i.test(name)) { res.writeHead(400).end("bad filename"); return; }
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 15e6) { res.writeHead(413).end("too big"); return; }
        chunks.push(c);
      }
      await writeFile(join(ROOT, "img", name), Buffer.concat(chunks));
      console.log(`  📷 saved img/${name} (${Math.round(size / 1024)} kB)`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, file: name }));
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
