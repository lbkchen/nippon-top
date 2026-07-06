# NIPPON TOP — notes for Claude

Playful static map of Ken's Japan recs, shared read-only with friends; only Ken edits.
Hard constraints: **no paid APIs/keys ever, no framework, no build step.** README has the file map.

## Dev loop

- Serve: `node tools/serve.mjs` on :4173 (no-cache headers — plain `python3 -m http.server`
  serves stale ES modules; never recommend it). `.claude/launch.json` works with preview_start.
  It also accepts `PUT /img/<file>` (dev-only photo drop), `PUT /friends/<file>`
  (friend-pack export), and `POST /publish` (one-click publish: builds the commit in a
  throwaway worktree from origin/main — local checkout state is irrelevant — validates via
  the worktree's check-data, bumps data.js ?v only when content changed, sweeps new
  img/friends files, pushes origin HEAD:main = deploys; stale-base guard vs origin/main,
  dry-run mode for tests, worktree cleanup in finally) — binds 127.0.0.1 only. In dev the
  export tool IS the publish button (two-tap armed); localStorage is a draft buffer and the
  tool badge counts unpublished edits (`pendingCount()` in store.js, "dirty" bus event from
  lsSet). After a publish the local repo only fast-forwards if cleanly on main; otherwise
  the badge sticks until a manual pull — that's intentional.
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
  doodles. In-app edits live in localStorage until 💾 export downloads a replacement
  data.js; both paths stay compatible (export ↔ rebuild are merge-safe by id/slug).
  Friend maps are NOT in data.js: each exports separately as an encrypted
  `friends/<file>.enc` pack + `friends/index.json` manifest (dev: saved straight into
  the repo via serve.mjs PUT; prod: downloads). Pack content sanity checks live in the
  exporter because CI can't see inside ciphertext; check-data only cross-checks
  manifest ↔ blobs.
- Coords, best source first: `gmaps` share link (resolved to the exact !3d/!4d marker —
  build-time via tools/gmaps-cache.json, in-app via config.js parseGmapsLink + serve.mjs
  /gmaps shortlink resolver, dev-only) > `pin: true` (hand pin authoritative; Nominatim
  returns polygon centroids for big areas, which land up the mountain) > Nominatim
  (`--geocode`, 1 req/s, cached in tools/geocode-cache.json; per-category distance gates,
  big-bbox hits rejected in favor of the hand pin) > fallback + `approx: true`
  ("~ish location"). The gmaps link doubles as the "open in google maps" target (otherwise:
  name search anchored @lat,lng). In-app pin fixes ride the `nippon_custom_geo` overlay
  until export; rebuilds carry over data.js gmaps/coords like photos. Runtime geocoding
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
  "N new recs since last edit" staleness pill. `notes{placeId}` = personal lines only
  that friend sees. Packs can also carry `extraPlaces/extraZones/extraDoodles` — spots,
  zones, and ink that exist ONLY on that friend's map (never in plaintext in the public
  repo; no photos on extras since img/ is public). An edit session survives tool
  switches (add/zone/pen writes land in the pack via store routing) and ends only via
  save/nvm. Friend view hides non-included pins outright (never dim them).
- **Friend packs** (the wire format): each curation ships encrypted as
  `friends/<file>.enc` — deflate + AES-GCM via js/pack.js; `file` + `key` are minted
  once on first save and NEVER change (the link depends on them). Share link =
  `#for=<file>.<key>`; the key lives only in links, Ken's localStorage, and the
  downloadable keyring — never in the repo. `friends/index.json` = public manifest
  (names + files, no keys) for the manager drawer and check-data. "adopt this map" on
  a fetched pack imports it for editing = Ken's cross-browser recovery path.
  localStorage is staging/cache only: anything durable must be reconstructible from
  repo artifacts + a link. Legacy `#for=<slug>` and `#mix=` links still parse.
- **Zones** = ski-map area annotations (draw via zones menu or lasso→save; solid/dots/hatch
  fills). Editable after creation ("retouch" via popup or the ZONE CONTROL drawer, which also
  does per-zone hide + jump). Zones scope the sidebar ("N recs inside — show them",
  `state.zoneFilter`, roulette follows). While the naming modal is open (docked right / bottom
  sheet, `modal-side`) a marching-ants preview shows the pending polygon and restyles with the
  pickers; a retouched zone hides behind its preview. Base-zone edits = copy-on-write shadows
  by id; deletes = tombstones (`nippon_dead_zones`) so exports/reloads don't resurrect them.
- **Doodles** = typed entries in one store array, all pack-routable: ink strokes
  ({color, w, z, pts} — simplified on save, Chaikin-smoothed on render, weight scales
  2^(zoom-z)), text stickers and hanko stamps ({type, at:[lat,lng], z, s?} — stamps are
  hand-drawn SVGs in js/stamps.js, NEVER emojis). Stickers you own are grabbable in pen mode:
  drag moves them, a tap opens the mini menu (bigger/smaller/reword/peel off, all undo-able —
  `s` = user scale on top of zoom scale). Same tombstone trick (`nippon_dead_doodles`).
  Pen tray = brushes/highlighter/eraser/text/stamp tools, strictly one in hand at a time
  (disarmTools), + session undo/redo (add/remove/update ops). Tray buttons carry flyout
  labels; armCheck puts its ask in the label (never nukes icon SVGs).
  **Chains** = pinless everywhere-recs in a drawer.
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
- Never `prompt()`/`alert()`/`confirm()` — styled modals, inline editors, or two-tap armed
  buttons (`armCheck` in config.js). Copy is lowercase, playful, a little unhinged.

## Shipping

- Repo: github.com/lbkchen/nippon-top, **public** (Ken flipped it 2026-07-03; his personal
  place notes are published by design). The Pages workflow (.github/workflows/pages.yml)
  validates data and deploys the live site on every push to main:
  https://lbkchen.github.io/nippon-top/ — so pushing main = shipping to friends.
- Public repo means committed files are browsable by anyone — don't commit anything
  friend-private in plaintext (friend packs are encrypted for exactly this reason).
- Commit per coherent phase with descriptive messages; run check-data first.
