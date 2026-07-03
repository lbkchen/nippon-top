# img/

Photos for the spot detail panel.

**The easy way (drag-and-drop):** run `node tools/serve.mjs`, open a spot's detail
panel, and drag a photo onto it (or click the drop zone to pick a file). The app
web-sizes it in the browser (max 1600px, jpeg), the dev server saves it here as
`<place-id>.jpg`, and the `photo` field rides the localStorage overlay until your
next 💾 export bakes it into `data.js`. Dropping again swaps the photo. Dev-only —
the deployed site has no write path.

**The manual way:**

1. Drop the file here — `kichijoji.jpg`, `tomita.webp`, etc. Keep them web-sized
   (~1200px wide, <300KB is plenty; `sips -Z 1200 photo.jpg` on macOS).
2. Set `photo: "kichijoji.jpg"` on the place in `tools/build-data.mjs`,
   then run `node tools/build-data.mjs`.

Either way, `node tools/check-data.mjs` verifies every referenced file actually
exists, rebuilds carry over photos that only live in `data.js`, and missing/broken
images degrade gracefully — the panel just skips the photo block.
