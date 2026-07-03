# NIPPON TOP 🗾

**ken's extremely correct japan recs™** — a very serious map for very unserious people.

A zero-build, zero-API-key, zero-dollar map of every Japan rec from the spreadsheet:
74 places, 17 certified bangers ⭐, 10 chains, vibe zones, and forkable friend maps.

## Run it locally

All you need is [Node](https://nodejs.org) 18+. No `npm install` — there are no dependencies.

```sh
git clone <this repo> && cd nippon-top
node tools/serve.mjs
```

→ open **http://localhost:4173**. That's the whole thing.

Use that server, not `python3 -m http.server` — python caches ES modules stale (you'll get
old code after edits) and photo drag-and-drop can't save through it. If :4173 is taken,
`node tools/serve.mjs 5000` picks another port.

## What it does

| thing | how |
|---|---|
| 🪢 **Lasso** | draw a loop around pins → everything inside lists in the sidebar with full notes. The "what's worth it around here today" tool. |
| 🎿 **Zones** | ski-map style area annotations ("Chuo Line Cool Zone"). Draw one from the zones menu, or save any lasso as a zone — either way you name it and pick its flag color. |
| 🔎 **Omnisearch** | the primary bar under the logo: typing live-filters the rec pins AND searches real-world places/addresses (Photon — komoot's free, keyless OSM geocoder) in one dropdown. Pick a rec → fly to it; pick an address → add a spot there or measure distances from it ("what's near my hotel?"). Same search lives inside the add-spot form. |
| 🖊️ **Doodle** | freehand ink that sticks to the terrain. iPad/Pencil friendly. |
| 📍 **Add a spot** | click the map, fill the form. Lives in your browser until exported. |
| 💌 **Friend maps** | fork the whole map for a person — see below, this is the good stuff. |
| 🎰 **Roulette** | can't decide? fate picks from what's on screen. Bangers weighted 3×. |
| 🧭 **Find me** | blue dot + walking distance on every card, list re-sorts nearest-first. Every card/popup also links straight into Google Maps for actual navigation (plain URL, no API). |
| 🔗 **The Usual Chains** | recs that are everywhere on purpose (Torikizoku, konbini, Donki…) live in a drawer, not on pins. |
| 💾 **Export** | downloads a fresh `data.js` with every in-browser edit baked in. Drop it in the repo → canon. |
| ⭐ **Bangers only** | the spreadsheet's star system, honored. Star pins are bigger, golden, and gently smug. |
| 📖 **Spot detail** | clicking a card/search result/roulette pick drills the sidebar into one spot: photo, the whole rant, which vibe zone it's inside, and "pairs well with" — the 3 nearest recs, clickable, so you can hop rec to rec. On localhost, just drag a photo onto the panel — it web-sizes itself, lands in `img/`, and ships with your next export (see `img/README.md`). |

Esc exits any mode. `?splash` forces the title card (it otherwise plays once per session).

## Friend maps (curations)

Fork the map for a person without it going stale:

- **"everything except…" (exclude mode)** — their map is *base minus exclusions*. When you add
  a new rec next month, it shows up on their map automatically. Rebase on head, zero effort.
- **"handpicked only" (include mode)** — a frozen list for a specific trip. The manager shows
  "⏰ N new recs since last edit" so you know when it's drifting.
- **Personal notes** — per-place lines only they see ("the duck ramen has your name on it").
- Share via `nippon.top/#for=alice` style links. The 💌 drawer shows every fork, how it differs
  from base, and whether its link is published yet.

Friend maps you make in the browser live in localStorage until you 💾 export — the share link
works for other people only after the exported `data.js` is committed and deployed.

## Editing the data

Two ways, and they can't clobber each other:

1. **In the app** — add spots, zones, friend maps, doodles → 💾 export → replace `data.js`.
2. **At the source** — edit the master list in `tools/build-data.mjs`, then `node tools/build-data.mjs`.
   The rebuild carries over everything that only exists in `data.js` (custom spots, custom zones,
   curations, doodles). Add `--geocode` to resolve new places via Nominatim (free OSM geocoder,
   1 req/sec, cached in `tools/geocode-cache.json`; hits >50 km from the hand-placed fallback are
   rejected so a bad geocode can't yeet a ramen shop into the sea).

Places the geocoder couldn't find use hand-placed coordinates and wear an `~ish location` tag.

`node tools/check-data.mjs` validates everything (unique ids, real categories, coords actually
in Japan, friend maps referencing real places). CI runs it before every deploy.

## Deploying (free, one push)

The repo ships with a GitHub Pages workflow ([.github/workflows/pages.yml](.github/workflows/pages.yml)).
Every push to `main` validates the data; the deploy step runs once the repo is **public**
(GitHub Pages is a paid feature on private repos, so it skips itself while private).

To go live:

```sh
gh repo edit --visibility public --accept-visibility-change-consequences
# then once, in the repo settings: Settings → Pages → Source: "GitHub Actions"
```

No keys, no backend, no bill — map tiles are OpenStreetMap data via Carto's free basemaps,
geocoding was a one-time offline step. Netlify/Cloudflare Pages work identically (it's just
static files) and both deploy private repos for free, if going public isn't the vibe.

## Architecture

No framework, no build step, no dependencies to rot. Vanilla ES modules wired through a
tiny event bus:

```
index.html          static shell: every panel/drawer/modal lives here
styles.css          the whole look — sticker-bomb + halftone + rough ink
data.js             generated data (window.NIPPON) — never hand-edit
js/
  main.js           boot order
  bus.js            EventTarget wrapper — modules talk via events, not imports
  config.js         categories, palette, pure helpers
  store.js          state + data + localStorage overlay + curation logic
  map.js            Leaflet init, layers, padding
  pins.js           markers, popups, zoom scaling
  sidebar.js        cards, filters, search, region hops
  modes.js          tool switching, Esc, toolbar dispatch
  sketch.js         shared freehand pointer capture
  lasso.js zones.js doodle.js addspot.js curations.js
  chains.js exporter.js roulette.js splash.js
tools/
  build-data.mjs    master place list → data.js (merge-safe, optional --geocode)
  check-data.mjs    validator (CI gate)
  serve.mjs         no-cache dev server
```

Adding a feature = one new module listening on the bus + one `init()` call in `main.js`.
