# NIPPON TOP — notes for Claude

Playful static map site of Ken's Japan recs. No framework, no build step, **no paid APIs ever**.
Read README.md for the architecture map; it's accurate.

## Working on it

- Dev server: `node tools/serve.mjs` on :4173 (`.claude/launch.json` is set up — use preview_start).
  It sends no-cache headers; plain `python3 -m http.server` will serve stale ES modules.
- Debug/test handle in the browser: `window.__nippon` = `{ map, state, store, markers, emit, setMode }`.
  Module scope isn't global — always go through this in preview_eval.
- `?splash` query forces the splash screen open (it's session-once otherwise).
- Before committing data changes: `node tools/check-data.mjs` (CI runs it too).

## Data flow (don't break this)

- `tools/build-data.mjs` holds the master place list → generates `data.js`. Rebuilds carry over
  anything that exists only in `data.js` (custom-* places, custom zones, curations, doodles) —
  keep that merge behavior intact.
- In-app edits live in localStorage until the user hits 💾 export, which downloads a replacement
  `data.js`. Both paths must stay compatible.
- `data.js` is generated — never hand-edit it.

## Conventions

- One feature = one module in `js/`, talking via `js/bus.js` events (list documented there),
  wired with an `init()` call in `js/main.js`. Avoid cross-feature imports except leaf utils
  (`config.js`), data (`store.js`), and map plumbing (`map.js`).
- Style: cream/ink/red/gold palette, Bangers display font, halftone dots, skewed sticker shapes,
  hard offset shadows. Copy is lowercase, playful, a little unhinged. Keep both.
- Radii come from the token scale in styles.css (--r-cut/sm/md/lg) — never hardcode px radii.
- Emoji policy (Ken's explicit feedback): pins, category glyphs, and the card↔pin link keep
  emojis; UI chrome (buttons, pills, hints, headers, toasts) is text-only. Toolbar uses inline
  SVG line icons with hover labels. No prompt()/alert() — use the styled modals.
- Runtime geocoding is Photon (photon.komoot.io): free, keyless, typeahead-friendly. Keep the
  350ms debounce and attribution. Nominatim is for offline build-time geocoding only.
- Coordinates: places the geocoder missed are `approx: true` and wear "~ish location" tags.
  Geocode fixes go in `build-data.mjs` fallbacks (Nominatim results >50km from fallback are auto-rejected).
