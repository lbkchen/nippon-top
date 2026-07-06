#!/usr/bin/env node
// Zero-dependency static server with no-cache headers, so edits always show up.
// Also accepts PUT /img/<file> (dev-only photo drop) and PUT /friends/<file>
// (friend-pack export) so the app can save straight into the repo
// (localhost only — the server never binds beyond 127.0.0.1).
//   node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, copyFile } from "node:fs/promises";
import { join, extname, normalize, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const run = promisify(execFile);

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

// ---- one-click publish (worktree edition) ----
// POST /publish { data, summary, baseHash, dry } — builds the publish commit in
// a throwaway git worktree checked out from origin/main, so the real checkout
// (whatever branch / mess it's in) is never touched or consulted. In the
// worktree: write data.js, bump its ?v in index.html, copy new photos/packs
// over, gate on check-data, commit, push origin HEAD:main. `dry` stops short
// of commit+push. Afterwards, best-effort `pull --ff-only` syncs the local
// checkout when it's sitting cleanly on main.
let publishing = false;

const git = (...args) => run("git", args, { cwd: ROOT, timeout: 120_000 });

// same djb2 the app uses on its boot-time data.js — keep in sync with exporter.js
const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };

// what the app may sweep into a publish — same allowlists as the PUT endpoints
const SWEEP = [
  { dir: "img", ok: /^[\w.-]+\.(jpe?g|png|webp|avif)$/i },
  { dir: "friends", ok: /^([\w-]+\.enc|index\.json)$/ },
];

async function publish(body) {
  const { data, summary = "", baseHash = null, dry = false } = JSON.parse(body.toString("utf8"));
  if (typeof data !== "string" || !data.startsWith("// NIPPON TOP data")) return { status: 400, error: "that doesn't look like data.js" };

  try { await git("fetch", "origin", "main"); }
  catch (e) { return { status: 502, error: `couldn't reach github: ${(e.stderr || e.message).trim().slice(0, 200)}` }; }

  // stale-base guard, now against what's actually published: if the app booted
  // from a data.js that isn't origin/main's, publishing would overwrite newer
  // edits (other machine, direct commit, an older local repo…)
  if (baseHash != null) {
    const published = (await git("show", "origin/main:data.js")).stdout;
    if (djb2(published) !== baseHash) {
      return { status: 409, error: "github has a different map than this page started from — sync the repo (git pull on main), reload, and publish again" };
    }
  }

  await git("worktree", "prune"); // sweep leftovers from any crashed publish
  const wt = await mkdtemp(join(tmpdir(), "nippon-publish-"));
  try {
    await git("worktree", "add", "--detach", wt, "origin/main");
    const wgit = (...args) => run("git", args, { cwd: wt, timeout: 120_000 });

    // only rewrite data.js when its CONTENT changed — the exported text never
    // byte-matches the build-generated one (different header), and a header-only
    // commit + ?v bump would bust everyone's cache for nothing
    const parseData = (txt) => { const w = {}; new Function("window", txt)(w); return JSON.stringify(w.NIPPON); };
    let dataChanged = true;
    try { dataChanged = parseData(await readFile(join(wt, "data.js"), "utf8")) !== parseData(data); }
    catch { /* unparseable candidate — let check-data produce the real error */ }
    if (dataChanged) {
      await writeFile(join(wt, "data.js"), data);
      const idx = await readFile(join(wt, "index.html"), "utf8");
      await writeFile(join(wt, "index.html"), idx.replace(/data\.js\?v=(\d+)/, (_, n) => `data.js?v=${+n + 1}`));
    }
    // photo drops + sealed packs land in the real working tree — bring over
    // anything new or changed (additive only; nothing in-app deletes these).
    // scope only names paths that exist: `git add` fatals on empty pathspecs
    const scope = ["data.js", "index.html"];
    for (const { dir, ok } of SWEEP) {
      const src = join(ROOT, dir);
      let names = [];
      try { names = (await readdir(src)).filter((n) => ok.test(n)); } catch { /* dir absent */ }
      if (names.length) {
        await mkdir(join(wt, dir), { recursive: true });
        for (const n of names) {
          const a = await readFile(join(src, n)).catch(() => null);
          const b = await readFile(join(wt, dir, n)).catch(() => null);
          if (a && (!b || !a.equals(b))) await copyFile(join(src, n), join(wt, dir, n));
        }
      }
      try { await readdir(join(wt, dir)); scope.push(dir); } catch { /* nothing there to add */ }
    }

    try {
      // the worktree's own copy — check-data locates data.js relative to itself
      await run(process.execPath, [join(wt, "tools", "check-data.mjs")], { cwd: wt });
    } catch (e) {
      return { status: 422, error: `check-data said no:\n${(e.stdout || e.message).trim().slice(0, 600)}` };
    }

    await wgit("add", "-A", "--", ...scope);
    const staged = (await wgit("diff", "--cached", "--name-only")).stdout.trim();
    if (!staged) return { status: 200, ok: true, nothing: true };
    if (dry) return { status: 200, ok: true, dry: true, wouldCommit: staged.split("\n") };

    const msg = `map update from the app${summary ? ` — ${String(summary).replace(/[\r\n]+/g, " ").slice(0, 120)}` : ""}`;
    await wgit("commit", "-m", msg);
    try { await wgit("push", "origin", "HEAD:main"); }
    catch (e) {
      return { status: 409, error: `push rejected (github moved mid-publish?): ${(e.stderr || e.message).trim().slice(0, 200)} — just publish again` };
    }
    const sha = (await wgit("rev-parse", "--short", "HEAD")).stdout.trim();

    // best-effort: bring the local checkout along so the badge zeroes out on
    // reload — only when it's cleanly on main, never force anything
    let synced = false;
    const branch = (await git("rev-parse", "--abbrev-ref", "HEAD")).stdout.trim();
    if (branch === "main") {
      const dirty = (await git("status", "--porcelain", "--", "data.js", "index.html")).stdout.trim();
      if (!dirty) synced = await git("pull", "--ff-only").then(() => true, () => false);
    }
    console.log(`  🚀 published ${sha}${synced ? "" : ` (local checkout on "${branch}" left alone)`}: ${msg}`);
    return { status: 200, ok: true, commit: sha, files: staged.split("\n"), synced, branch };
  } finally {
    await rm(wt, { recursive: true, force: true }).catch(() => {});
    await git("worktree", "prune").catch(() => {});
  }
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
