# NIPPON TOP — notes for Claude

Playful static map of Ken's Japan recs, shared read-only with friends; only Ken edits.
Hard constraints: **no paid APIs/keys ever, no framework, no build step.** README has the file map.

## Dev loop

- Serve: `node tools/serve.mjs` on :4173 (no-cache headers — plain `python3 -m http.server`
  serves stale ES modules; never recommend it). `.claude/launch.json` works with preview_start.
  It also accepts `PUT /img/<file>` for the detail panel's dev-only photo drop (binds 127.0.0.1).
- Debug/test in browser: `window.__nippon` = `{ map, state, store, markers, emit, setMode }`.
  Module scope isn't global; always go through this in preview_eval. Simulate lasso/doodle with
  synthetic PointerEvents on `#map` (screenshots downscale ~55% — get coords from
  `latLngToContainerPoint`, not from screenshots).
- Verify features functionally (eval battery) AND visually (`preview_inspect` computed styles,
  screenshot at 1440×900 + mobile preset). Viewport emulation resets on navigation — resize
  again after any reload. Check console for errors before calling anything done.
- `?splash` forces the splash screen (otherwise session-once).
- Before committing data or feature work: `node tools/check-data.mjs` (CI gate too).
- Bump `?v=N` on styles.css/data.js/main.js in index.html for any user-visible change —
  stale-cache mixing of old CSS + new markup has bitten us before.

## Architecture

- One feature = one module in `js/`, an `init()` call in `js/main.js`, cross-feature talk ONLY
  via `js/bus.js` events (event list documented there). Allowed direct imports: leaf utils
  (`config.js`, `photon.js`), data/state (`store.js`), map plumbing (`map.js`), and `modes.js`
  for setMode. No other feature→feature imports.
- `store.js` owns all state + the localStorage overlay (keys `nippon_custom_*`). `state.q` is
  owned by the omnibar (`omnisearch.js`) — never add another search input (exception: the
  add-spot modal's location search).
- Sketch-on-map interactions (lasso/pen/zone) register through `sketch.js`, not their own
  pointer handlers.

## Data flow (don't break)

- `tools/build-data.mjs` = master place list → generates `data.js` (never hand-edit data.js).
  Rebuilds MUST carry over what exists only in data.js: `custom-*` places, custom zones,
  curations, doodles. In-app edits live in localStorage until 💾 export downloads a replacement
  data.js; both paths stay compatible (export ↔ rebuild are merge-safe by id/slug).
- Geocoding: build-time only, via Nominatim (`--geocode`, 1 req/s, cached in
  tools/geocode-cache.json; hits >50 km from the hand-placed fallback are auto-rejected).
  Places the geocoder missed carry `approx: true` and show "~ish location". Runtime geocoding
  is Photon (photon.komoot.io) — free, keyless, typeahead OK; keep the 350 ms debounce,
  result dedupe, and attribution.

## Domain concepts

- **Place**: `star` = certified banger (bigger gold pin, weighted 3× in roulette). `cat` keys
  live in config.js CATS; `group` drives region chips. `emoji` overrides the cat glyph.
  `photo` = filename in img/ (see img/README.md), shown by the detail panel (js/detail.js);
  set it by dragging a photo onto the panel in dev (web-sized in-browser, saved via serve.mjs,
  rides the `nippon_custom_photos` overlay until export; rebuilds carry data.js photos over).
  Missing/broken files degrade gracefully. check-data verifies referenced files exist.
- **Curations (friend maps)** — the fork model, Ken's core feature:
  `mode:"exclude"` = base minus `ids`, auto-inherits new recs ("rebase on head");
  `mode:"include"` = frozen handpicks; `seen` (base ids at last save) powers the
  "N new recs since last edit" staleness pill. `notes{placeId}` = personal lines only that
  friend sees. Shared as `#for=<slug>`; links only work for others after export + deploy.
  Legacy `#mix=` links still parse.
- **Zones** = ski-map area annotations (draw via zones menu or lasso→save); **chains** =
  pinless everywhere-recs in a drawer; **doodles** = freehand ink in map coords.
- `state.userLoc` = reference point (GPS or searched address) → distance pills + nearest-first
  sort.

## Design system (Ken's explicit taste — violations read as "AI-vibecoded")

- Palette/type: cream/ink/red/gold CSS vars, Bangers display, Fredoka UI, Nunito body,
  DotGothic16 for 頂 hanko accents. Halftone dots, skewed sticker shapes, hard offset shadows,
  rough-ink SVG filter (`.rough-line`) on map paths. Voyager tiles (Positron tested: sterile).
- Radii ONLY from tokens `--r-cut/sm/md/lg`, applied by element family. Never hardcode.
- Emoji policy: pins, category glyphs, and the card↔pin link keep emojis; ALL UI chrome
  (buttons, pills, hints, headers, toasts) is text-only.
- Icon buttons: inline SVG line icons (stroke 2.2, round caps, slightly wobbly paths) with
  explicit width/height attrs + flyout labels on hover/focus + aria-labels.
- Never `prompt()`/`alert()` — styled modals or inline editors. Copy is lowercase, playful,
  a little unhinged.

## Shipping

- GitHub Pages workflow (.github/workflows/pages.yml) validates data then deploys on push.
  Ken hasn't created the GitHub repo — never create/push/publish without his explicit OK.
- Commit per coherent phase with descriptive messages; run check-data first.
