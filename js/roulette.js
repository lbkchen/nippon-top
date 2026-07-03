// Osusume roulette: let fate pick tonight's move. Bangers weighted 3x.
import { showHint } from "./config.js";
import { currentList } from "./store.js";
import { emit, on } from "./bus.js";
import { openSidebar } from "./sidebar.js";

let spinning = false;

function spin() {
  if (spinning) return;
  const pool = currentList();
  if (!pool.length) { showHint("nothing in view to gamble on — zoom out first", 2500); return; }
  const weighted = pool.flatMap((p) => (p.star ? [p, p, p] : [p]));
  const pick = weighted[Math.floor(Math.random() * weighted.length)];
  spinning = true;
  openSidebar();
  let i = 0;
  const iv = setInterval(() => {
    const rand = pool[Math.floor(Math.random() * pool.length)];
    emit("place-selected", { id: rand.id, fly: false });
    if (++i >= 10) {
      clearInterval(iv);
      spinning = false;
      emit("place-selected", { id: pick.id, fly: true, openList: true });
      showHint(`fate has spoken: ${pick.name}${pick.star ? " ★" : ""} — no backsies`, 4000);
    }
  }, 110);
}

export const initRoulette = () => on("roulette", spin);
