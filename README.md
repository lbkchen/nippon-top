# NIPPON TOP 🗾

**ken's extremely correct japan recs™** — a very serious map for very unserious people.

A single-page, zero-build, zero-API-key map of every Japan rec from the spreadsheet:
74 places, 17 certified bangers ⭐, 10 chains, and a growing collection of hand-drawn vibe zones.

## Run it

Any static file server works:

```sh
python3 -m http.server 4173
# → http://localhost:4173
```

(Or just open `index.html` — everything is CDN + local files.)

## What it does

| thing | how |
|---|---|
| 🪢 **Lasso** | draw a loop around pins → everything inside lists in the sidebar. The "what should we do around here today" tool. |
| 🎿 **Zones** | ski-map style area annotations ("Chuo Line Cool Zone"). Save a lasso as a zone to make your own. |
| 🖊️ **Doodle** | freehand ink that sticks to the map (pans/zooms with it). iPad-friendly. |
| 📍 **Add a spot** | click the map, fill the form. Lives in your browser until exported. |
| 💌 **Mixtape** | pick spots, name a friend, copy a link — they see a personalized map, everything else dimmed. |
| 🔗 **Chain Gang** | recs that are everywhere on purpose (Torikizoku, konbini, Donki…) live in a drawer, not on pins. |
| 💾 **Export** | downloads a fresh `data.js` with all your in-browser edits baked in. Drop it in the repo → your edits become canon. |
| ⭐ **Bangers only** | the star system from the spreadsheet, honored. Star pins are bigger, golden, and gently smug. |

Plus search, category filters, region-hopping chips, and a sidebar that always shows full
notes for whatever's on screen — the spreadsheet's context, without the spreadsheet.

## Editing the data

Two ways:

1. **In the app** — add spots (📍), draw zones (🎿), then hit 💾 export and replace `data.js`.
2. **At the source** — edit `tools/build-data.mjs` (the master list, with per-place notes),
   then `node tools/build-data.mjs` to regenerate `data.js`.
   Add `--geocode` to resolve new places via Nominatim (free OSM geocoder, 1 req/sec, cached
   in `tools/geocode-cache.json`). Results further than 50km from the hand-placed fallback
   coordinate are rejected automatically, so a bad geocode can't yeet a ramen shop into the sea.

Places the geocoder couldn't find use hand-placed coordinates and show an
`~ish location` tag — nudge them by fixing the `fallback` in `tools/build-data.mjs`.

## Publishing

It's a static site — GitHub Pages, Netlify, Cloudflare Pages, anything.
No keys, no backend, no bill. Map tiles are OpenStreetMap data via Carto's free basemaps.

Note: 📍/🎿/🖊️ edits made in the browser live in *that browser's* localStorage.
Friends visiting the published site see `data.js` only (and can't edit anything) —
export & commit to make your edits public.

## Stack

Leaflet 1.9 + Carto Voyager tiles + vanilla JS/CSS. No build step, no framework, no dependencies to rot.
