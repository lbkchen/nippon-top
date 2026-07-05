// Tool modes + toolbar dispatch.
import { $, $$, showHint, hideHint } from "./config.js";
import { map } from "./map.js";
import { state } from "./store.js";
import { emit, on } from "./bus.js";

const MODE_TOOLS = ["lasso", "pen", "add"];
const HINTS = {
  lasso: "draw a loop around some spots — everything inside shows up in the list",
  pen: "scribble on the map — ink sticks to the terrain, iPad approved",
  add: "search for the place, or click the map right where it goes",
  zone: "circle the whole area — you'll get to name it after",
  curate: "click pins or cards to flip them in or out — the note button on a card adds a personal line",
};

export function setMode(mode) {
  state.mode = state.mode === mode ? null : mode;
  const m = state.mode;
  $$("#toolbar button[data-tool]").forEach((b) => {
    if (MODE_TOOLS.includes(b.dataset.tool)) b.classList.toggle("active", b.dataset.tool === m);
  });
  const sketchy = m === "lasso" || m === "pen" || m === "zone";
  const mapEl = $("#map");
  mapEl.classList.toggle("lassoing", m === "lasso" || m === "zone");
  mapEl.classList.toggle("penning", m === "pen");
  mapEl.classList.toggle("adding", m === "add");
  mapEl.style.touchAction = sketchy ? "none" : "";
  document.body.dataset.mode = m || "";
  if (sketchy) map.dragging.disable(); else map.dragging.enable();
  $("#penTray").classList.toggle("hidden", m !== "pen");
  if (m) showHint(HINTS[m]); else hideHint();
  emit("mode-changed", m);
  emit("refresh");
}

export function initModes() {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    $("#addModal").classList.add("hidden");
    $("#zoneModal").classList.add("hidden");
    $("#zoneMenu").classList.add("hidden");
    $("#chainsDrawer").classList.add("hidden");
    $("#curationsDrawer").classList.add("hidden");
    if (state.mode) setMode(null);
    else emit("close-detail");
  });

  $$("#toolbar button[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tool;
      if (MODE_TOOLS.includes(t)) setMode(t);
      else if (t === "zones") emit("zones-menu");
      else if (t === "chains") emit("toggle-chains");
      else if (t === "curations") emit("open-curations");
      else if (t === "roulette") emit("roulette");
      else if (t === "locate") emit("locate");
      else if (t === "export") emit("export");
      if (window.innerWidth <= 940 && t !== "zones") closeTools(); // zones needs its flyout anchored
    });
  });

  // mobile: the whole toolbar lives behind one toolbox button
  const toolsToggle = $("#toolsToggle");
  function closeTools() {
    $("#toolbar").classList.remove("open");
    toolsToggle.classList.remove("open");
    toolsToggle.setAttribute("aria-expanded", "false");
  }
  toolsToggle.addEventListener("click", () => {
    const open = $("#toolbar").classList.toggle("open");
    toolsToggle.classList.toggle("open", open);
    toolsToggle.setAttribute("aria-expanded", open);
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#toolbar") && !e.target.closest("#toolsToggle") && !e.target.closest("#zoneMenu")) closeTools();
  });
  // a live mode shows on the toggle so the exit is never hidden away
  on("mode-changed", (m) => {
    toolsToggle.classList.toggle("active", !!m && MODE_TOOLS.includes(m));
    if (window.innerWidth <= 940 && !m) closeTools();
  });
}
