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
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const TOOLS = join(fileURLToPath(import.meta.url), "..");
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

// ---- one-click publish ----
// POST /publish { data, summary, dry } — write data.js, bump its ?v in
// index.html, validate with check-data, commit (data.js + index.html + img/ +
// friends/ only — never unrelated dirty files), push. Any failure before the
// commit restores both files. `dry` runs everything but commit+push (and skips
// the on-main check) so the flow is testable without shipping.
let publishing = false;

const git = (...args) => run("git", args, { cwd: ROOT, timeout: 60_000 });

async function publish(body) {
  const { data, summary = "", dry = false } = JSON.parse(body.toString("utf8"));
  if (typeof data !== "string" || !data.startsWith("// NIPPON TOP data")) return { status: 400, error: "that doesn't look like data.js" };

  const branch = (await git("rev-parse", "--abbrev-ref", "HEAD")).stdout.trim();
  if (branch !== "main" && !dry) return { status: 409, error: `repo is on "${branch}" — publish only ships from main` };

  // refuse if the files we're about to rewrite already have uncommitted edits
  // (a previous failed publish, or someone mid-tinker) — we can't restore those
  const dirty = (await git("status", "--porcelain", "--", "data.js", "index.html")).stdout.trim();
  if (dirty) return { status: 409, error: "data.js / index.html have uncommitted changes — commit or discard them first" };

  if (!dry) {
    const before = await readFile(join(ROOT, "data.js"), "utf8");
    try { await git("pull", "--ff-only"); }
    catch (e) { return { status: 409, error: `couldn't fast-forward main: ${(e.stderr || e.message).trim().slice(0, 200)}` }; }
    // the pull may have brought a newer map than the one the app booted from —
    // overwriting it would silently revert those changes
    if (await readFile(join(ROOT, "data.js"), "utf8") !== before) {
      return { status: 409, error: "just pulled a newer data.js from github — reload the app (your edits re-apply) and publish again" };
    }
  }

  const indexPath = join(ROOT, "index.html");
  const indexBefore = await readFile(indexPath, "utf8");
  const bumped = indexBefore.replace(/data\.js\?v=(\d+)/, (_, n) => `data.js?v=${+n + 1}`);
  await writeFile(join(ROOT, "data.js"), data);
  await writeFile(indexPath, bumped);

  try {
    await run(process.execPath, [join(TOOLS, "check-data.mjs")], { cwd: ROOT });
  } catch (e) {
    await git("checkout", "--", "data.js", "index.html");
    return { status: 422, error: `check-data said no:\n${(e.stdout || e.message).trim().slice(0, 600)}` };
  }

  const scope = ["data.js", "index.html", "img", "friends"];
  if (dry) {
    const would = (await git("status", "--porcelain", "--", ...scope)).stdout.trim();
    await git("checkout", "--", "data.js", "index.html");
    return { status: 200, ok: true, dry: true, wouldCommit: would.split("\n").filter(Boolean) };
  }

  await git("add", "--", ...scope);
  const staged = (await git("diff", "--cached", "--name-only")).stdout.trim();
  if (!staged) return { status: 200, ok: true, nothing: true };

  const msg = `map update from the app${summary ? ` — ${String(summary).replace(/[\r\n]+/g, " ").slice(0, 120)}` : ""}`;
  await git("commit", "-m", msg);
  try { await git("push"); }
  catch (e) {
    return { status: 502, error: `committed but push failed: ${(e.stderr || e.message).trim().slice(0, 200)} — run git push yourself` };
  }
  const sha = (await git("rev-parse", "--short", "HEAD")).stdout.trim();
  console.log(`  🚀 published ${sha}: ${msg}`);
  return { status: 200, ok: true, commit: sha, files: staged.split("\n") };
}

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
    if (req.method === "POST" && path === "/publish") {
      if (publishing) { res.writeHead(409, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "a publish is already running" })); return; }
      publishing = true;
      try {
        const body = await readBody(req, res, 20e6);
        if (!body) return;
        const { status, ...out } = await publish(body);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e.message || e).slice(0, 300) }));
      } finally {
        publishing = false;
      }
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
