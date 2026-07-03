// The usual chains: recs with no fixed address.
import { $, esc, linkify } from "./config.js";
import { BASE } from "./store.js";
import { on } from "./bus.js";

export function initChains() {
  const body = $("#chainsBody");
  for (const c of BASE.chains) {
    const div = document.createElement("div");
    div.className = "chain-card";
    div.innerHTML = `<div class="chain-name">${c.emoji} ${esc(c.name)}</div><div class="chain-notes">${linkify(esc(c.notes))}</div>`;
    body.append(div);
  }
  on("toggle-chains", () => $("#chainsDrawer").classList.toggle("hidden"));
  $("#drawerClose").addEventListener("click", () => $("#chainsDrawer").classList.add("hidden"));
}
