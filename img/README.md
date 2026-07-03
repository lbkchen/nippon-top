# img/

Photos for the spot detail panel. To give a place a photo:

1. Drop the file here — `kichijoji.jpg`, `tomita.webp`, etc. Keep them web-sized
   (~1200px wide, <300KB is plenty; `sips -Z 1200 photo.jpg` on macOS).
2. Set `photo: "kichijoji.jpg"` on the place in `tools/build-data.mjs`,
   then run `node tools/build-data.mjs`.
3. `node tools/check-data.mjs` verifies every referenced file actually exists.

Missing/broken images degrade gracefully — the panel just skips the photo block.
