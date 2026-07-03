// Tool modes + toolbar dispatch.
import { $, $$, showHint, hideHint } from "./config.js";
import { map } from "./map.js";
import { state } from "./store.js";
import { emit } from "./bus.js";

const MODE_TOOLS = ["lasso", "pen", "add"];
const HINTS = {
  lasso: "🪢 draw a loop around some spots — everything inside shows up in the list",
  pen: "🖊️ scribble on the map — ink sticks to the terrain, iPad approved",
  add: "📍 click the map right where the new spot goes",
  curate: "💌 click pins or cards to flip them in/out — 📝 on a card adds a personal note",
};

export function setMode(mode) {
  state.mode = state.mode === mode ? null : mode;
  const m = state.mode;
  $$("#toolbar button[data-tool]").forEach((b) => {
    if (MODE_TOOLS.includes(b.dataset.tool)) b.classList.toggle("active", b.dataset.tool === m);
  });
  const mapEl = $("#map");
  mapEl.classList.toggle("lassoing", m === "lasso");
  mapEl.classList.toggle("penning", m === "pen");
  mapEl.classList.toggle("adding", m === "add");
  mapEl.style.touchAction = m === "lasso" || m === "pen" ? "none" : "";
  if (m === "lasso" || m === "pen") map.dragging.disable(); else map.dragging.enable();
  $("#penTray").classList.toggle("hidden", m !== "pen");
  if (m) showHint(HINTS[m]); else hideHint();
  emit("mode-changed", m);
  emit("refresh");
}

export function initModes() {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    $("#addModal").classList.add("hidden");
    $("#chainsDrawer").classList.add("hidden");
    $("#curationsDrawer").classList.add("hidden");
    if (state.mode) setMode(null);
  });

  $$("#toolbar button[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tool;
      if (MODE_TOOLS.includes(t)) setMode(t);
      else if (t === "zones") emit("toggle-zones");
      else if (t === "chains") emit("toggle-chains");
      else if (t === "curations") emit("open-curations");
      else if (t === "roulette") emit("roulette");
      else if (t === "locate") emit("locate");
      else if (t === "export") emit("export");
    });
  });
}
