# NIPPON TOP 🗾

**ken's extremely correct japan recs™** — a very serious map for very unserious people.

### 👉 the actual map: **[lbkchen.github.io/nippon-top](https://lbkchen.github.io/nippon-top/)** 👈

A zero-build, zero-API-key, zero-dollar map of every Japan rec from the spreadsheet:
74 places, 17 certified bangers ⭐, 10 chains, vibe zones, and forkable friend maps.

## Run it locally

All you need is [Node](https://nodejs.org) 18+. No `npm install` — there are no dependencies.

```sh
git clone https://github.com/lbkchen/nippon-top && cd nippon-top
node tools/serve.mjs
```

→ open **http://localhost:4173**. That's the whole thing.

Use that server, not `python3 -m http.server` — python caches ES modules stale (you'll get
old code after edits) and photo drops / pack exports can't save through it. If :4173 is
taken, `node tools/serve.mjs 5000` picks another port.

## What it does

| thing | how |
|---|---|
| 🪢 **Lasso** | draw a loop around pins → everything inside lists in the sidebar with full notes. The "what's worth it around here today" tool. |
| 🎿 **Zones** | ski-map style area annotations ("Chuo Line Cool Zone"). Draw one from the zones menu, or save any lasso as a zone. |
| 🔎 **Omnisearch** | one bar that live-filters the rec pins AND searches real places/addresses (Photon — komoot's free, keyless OSM geocoder). Pick a rec → fly to it; pick an address → add a spot there or measure distances from it ("what's near my hotel?"). |
| 🖊️ **Doodle** | freehand ink that sticks to the terrain. iPad/Pencil friendly. |
| 📍 **Add a spot** | click the map, fill the form. Lives in your browser until exported. |
| 💌 **Friend maps** | fork the whole map for a person — see below, this is the good stuff. |
| 🎰 **Roulette** | can't decide? fate picks from what's on screen. Bangers weighted 3×. |
| 🧭 **Find me** | blue dot + walking distance on every card, list re-sorts nearest-first. Every card links into Google Maps for actual navigation (plain URL, no API). |
| 🔗 **The Usual Chains** | recs that are everywhere on purpose (Torikizoku, konbini, Donki…) live in a drawer, not on pins. |
| 💾 **Export** | downloads a fresh `data.js` with every in-browser edit baked in. Drop it in the repo → canon. |
| ⭐ **Bangers only** | the spreadsheet's star system, honored. Star pins are bigger, golden, and gently smug. |
| 📖 **Spot detail** | click anything to drill into one spot: photo, the whole rant, which vibe zone it's in, and the 3 nearest recs to hop to. On localhost, drag a photo onto the panel — it web-sizes itself and ships with your next export. |

Esc exits any mode. `?splash` forces the title card (it otherwise plays once per session).

## Friend maps

Fork the map for a person without it going stale:

- **"everything except…" (exclude mode)** — their map is *base minus exclusions*. When a new
  rec lands next month, it shows up on their map automatically. Rebase on head, zero effort.
- **"handpicked only" (include mode)** — a frozen list for a specific trip. The manager shows
  "N new recs since last edit" so you know when it's drifting.
- **Personal notes** — per-place lines only they see ("the duck ramen has your name on it").
- **Their own extras** — bonus spots, zones, and ink that exist *only* on their map, never on
  the public one. An edit session survives tool switches: flip pins, hop to add-spot or the
  pen, and it all lands in their map until you save (or nvm).

Every friend map ships as an **encrypted pack** — `friends/<file>.enc`, sealed in the browser
(deflate + AES-GCM, no server anywhere) — and the share link carries the only key:

```
…/#for=alice-x7k2m9.<key>
```

The public repo holds ciphertext, so nobody's map can be snooped from GitHub; the link keeps
working across edits (same file, same key, just re-export). The 💌 drawer manages every fork:
edit, copy link, export pack (in dev it saves straight into `friends/`), plus a **keyring
download** with every key. On a fresh browser, opening any friend link and hitting
**adopt this map** pulls it back in for editing — the link *is* the backup.

## Editing the data

Two ways, and they can't clobber each other:

1. **In the app** — add spots, zones, doodles → 💾 export → replace `data.js`. Friend maps
   export separately from the 💌 drawer as packs.
2. **At the source** — edit the master list in `tools/build-data.mjs`, then
   `node tools/build-data.mjs`. The rebuild carries over everything that only exists in
   `data.js` (custom spots, custom zones, doodles); packs are untouched. Add `--geocode` to
   resolve new places via Nominatim (free OSM geocoder, 1 req/sec, cached; hits >50 km from
   the hand-placed fallback are rejected so a bad geocode can't yeet a ramen shop into the sea).

Places the geocoder couldn't find use hand-placed coordinates and wear an `~ish location` tag.

`node tools/check-data.mjs` validates everything (unique ids, real categories, coords actually
in Japan, pack manifest ↔ blobs). CI runs it before every deploy.

## Deploying (free, one push)

Every push to `main` validates the data and ships the live site via GitHub Pages
([.github/workflows/pages.yml](.github/workflows/pages.yml)). Pushing main = shipping to
friends. That's the entire release process.

No keys, no backend, no bill — map tiles are OpenStreetMap data via Carto's free basemaps,
geocoding was a one-time offline step, and friend-map encryption is the browser's own WebCrypto.

## Architecture

No framework, no build step, no dependencies to rot. Vanilla ES modules wired through a
tiny event bus:

```
index.html          static shell: every panel/drawer/modal lives here
styles.css          the whole look — sticker-bomb + halftone + rough ink
data.js             generated data (window.NIPPON) — never hand-edit
friends/            encrypted friend-map packs (*.enc) + public manifest (index.json);
                    the decryption key lives only in each friend's share link
js/
  main.js           boot order
  bus.js            EventTarget wrapper — modules talk via events, not imports
  config.js         categories, palette, pure helpers
  store.js          state + data + localStorage overlay + curation logic
  map.js            Leaflet init, layers, padding
  pack.js           friend-pack codec: deflate + AES-GCM, fetch with offline cache
  pins.js           markers, popups, zoom scaling
  sidebar.js        cards, filters, search, region hops
  modes.js          tool switching, Esc, toolbar dispatch
  sketch.js         shared freehand pointer capture
  lasso.js zones.js doodle.js addspot.js curations.js
  chains.js exporter.js roulette.js splash.js
tools/
  build-data.mjs    master place list → data.js (merge-safe, optional --geocode)
  check-data.mjs    validator (CI gate)
  serve.mjs         no-cache dev server (also saves photo drops + pack exports)
```

Adding a feature = one new module listening on the bus + one `init()` call in `main.js`.
