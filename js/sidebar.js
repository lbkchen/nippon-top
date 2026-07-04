// The high-context list: cards, filters, search, region hops, context bar.
import { CATS, $, $$, esc, linkify, distKm, fmtDist, gmapsUrl, armCheck } from "./config.js";
import { map, PAD } from "./map.js";
import { state, allPlaces, currentList, groupBounds, deletePlace, isCustom, BASE } from "./store.js";
import { emit, on } from "./bus.js";
import { highlightPin } from "./pins.js";

export function openSidebar() {
  $("#sidebar").classList.remove("collapsed");
  $("#sidebarTab").classList.add("hidden");
}

function renderContextBar() {
  const bar = $("#contextBar");
  bar.innerHTML = "";
  const n = currentList().length;
  const label = document.createElement("span");
  if (state.curationView) {
    const c = state.curationView;
    label.textContent = `${c.emoji ? c.emoji + " " : ""}${c.name}'s map — ${n} spots`;
  } else if (state.lasso) {
    label.textContent = `lassoed ${n} spot${n === 1 ? "" : "s"}`;
    const clear = document.createElement("button");
    clear.className = "ctx-btn";
    clear.textContent = "clear";
    clear.onclick = () => emit("lasso-clear");
    const save = document.createElement("button");
    save.className = "ctx-btn gold";
    save.textContent = "save as zone";
    save.onclick = () => emit("lasso-save-zone");
    bar.append(label, clear, save);
    return;
  } else {
    label.textContent = `${n} in view`;
  }
  bar.append(label);
}

function cardEl(p) {
  const card = document.createElement("article");
  card.className = `card${p.star ? " starred" : ""}`;
  card.dataset.id = p.id;
  const cat = CATS[p.cat] || CATS.fun;
  const custom = isCustom(p.id);
  const editing = state.editingCuration;
  const viewNote = state.curationView?.notes?.[p.id];
  const editNote = editing?.notes?.[p.id];
  card.innerHTML = `
    ${p.star ? '<span class="banger-ribbon">CERTIFIED BANGER</span>' : ""}
    <div class="card-head">
      <span class="card-emoji">${p.emoji || cat.emoji}</span>
      <span class="card-name">${esc(p.name)}</span>
      ${p.star ? '<span class="card-star">★</span>' : ""}
    </div>
    <div class="card-pills">
      <span class="pill cat-pill" style="--pin:${cat.color}">${cat.label}</span>
      <span class="pill">${esc(p.region)}</span>
      ${p.approx ? '<span class="pill approx" title="the geocoder shrugged — pin placed from memory">~ish location</span>' : ""}
      ${custom ? '<span class="pill custom">hand-added</span>' : ""}
      ${state.userLoc ? `<span class="pill dist">${fmtDist(distKm(state.userLoc, [p.lat, p.lng]))}</span>` : ""}
      <a class="pill pill-link" href="${gmapsUrl(p)}" target="_blank" rel="noopener" title="open in google maps">gmaps ↗</a>
    </div>
    ${viewNote ? `<div class="card-personal">for ${esc(state.curationView.name)}: ${esc(viewNote)}</div>` : ""}
    <div class="card-notes">${linkify(esc(p.notes))}</div>
    ${p.notes && p.notes.length > 180 ? '<button class="card-more">the whole rant ▾</button>' : ""}
    ${editing ? `<button class="card-note-btn">${editNote ? "edit the" : "add a"} note for ${esc(editing.name || "them")}</button>` : ""}
    ${editNote ? `<div class="card-personal">for ${esc(editing.name || "them")}: ${esc(editNote)}</div>` : ""}
    ${custom && !state.curationView ? '<button class="card-del" title="delete this spot">delete</button>' : ""}`;

  card.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    if (e.target.classList.contains("card-more")) {
      card.classList.toggle("open");
      e.target.textContent = card.classList.contains("open") ? "less ▴" : "the whole rant ▾";
      return;
    }
    if (e.target.classList.contains("card-note-btn")) {
      const btn = e.target;
      const wrap = document.createElement("div");
      wrap.className = "note-editor";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 90;
      input.placeholder = `a line just for ${editing?.name || "them"}…`;
      input.value = editing?.notes?.[p.id] || "";
      const save = document.createElement("button");
      save.textContent = "save";
      save.className = "btn-solid";
      wrap.append(input, save);
      btn.replaceWith(wrap);
      input.focus();
      wrap.addEventListener("click", (ev) => ev.stopPropagation());
      save.addEventListener("click", () => emit("curation-note-set", { id: p.id, text: input.value }));
      input.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") emit("curation-note-set", { id: p.id, text: input.value });
        if (ev.key === "Escape") emit("refresh-list");
      });
      return;
    }
    if (e.target.classList.contains("card-del")) {
      if (armCheck(e.target, "it never happened?")) {
        deletePlace(p.id);
        emit("place-removed", { id: p.id });
        emit("refresh");
      }
      return;
    }
    if (state.mode === "curate") { emit("mix-toggle", p.id); return; }
    emit("open-detail", { id: p.id, fly: true });
  });
  card.addEventListener("mouseenter", () => highlightPin(p.id, true));
  card.addEventListener("mouseleave", () => highlightPin(p.id, false));
  return card;
}

export function renderList() {
  const wrap = $("#cards");
  wrap.innerHTML = "";
  const list = currentList().sort((a, b) =>
    state.userLoc
      ? distKm(state.userLoc, [a.lat, a.lng]) - distKm(state.userLoc, [b.lat, b.lng]) // located: nearest first
      : (b.star - a.star) || a.name.localeCompare(b.name));
  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state"><span class="big">🍥</span>nothing here…<br>zoom out, clear filters, or lasso somewhere tastier</div>`;
  } else {
    for (const p of list) wrap.append(cardEl(p));
  }
  renderContextBar();
  if (state.selectedId) selectCard(state.selectedId, { scroll: false });
  const total = allPlaces().length;
  $("#footCount").textContent = `${total} recs · ${allPlaces().filter((p) => p.star).length} bangers · ${BASE.chains.length} chains`;
}

function selectCard(id, { scroll = true } = {}) {
  $$(".card.selected").forEach((c) => c.classList.remove("selected"));
  const card = document.querySelector(`.card[data-id="${CSS.escape(String(id))}"]`);
  if (card) {
    card.classList.add("selected");
    if (scroll) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function buildCatChips() {
  const wrap = $("#catChips");
  const keys = Object.keys(CATS);
  for (const [key, cat] of Object.entries(CATS)) {
    const b = document.createElement("button");
    b.textContent = cat.emoji;
    b.title = cat.label;
    b.onclick = () => {
      if (state.cats.has(key) && state.cats.size === keys.length) {
        state.cats = new Set([key]); // first click on a full set = solo that category
      } else if (state.cats.has(key)) {
        state.cats.delete(key);
        if (!state.cats.size) state.cats = new Set(keys); // never strand an empty map
      } else {
        state.cats.add(key);
      }
      [...wrap.children].forEach((c, i) => c.classList.toggle("off", !state.cats.has(keys[i])));
      emit("refresh");
    };
    wrap.append(b);
  }
}

export function initSidebar() {
  buildCatChips();

  $("#starToggle").addEventListener("click", (e) => {
    state.starOnly = !state.starOnly;
    e.currentTarget.classList.toggle("active", state.starOnly);
    emit("refresh");
  });

  $("#regionChips").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $$("#regionChips button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    map.flyToBounds(groupBounds(btn.dataset.group), { ...PAD(), duration: 1.1 });
  });

  // collapse / restore
  const sidebar = $("#sidebar");
  const tab = $("#sidebarTab");
  const collapseBtn = document.createElement("button");
  collapseBtn.className = "sidebar-collapse";
  collapseBtn.title = "tuck the list away";
  collapseBtn.textContent = "▸";
  $(".sidebar-head").append(collapseBtn);
  collapseBtn.addEventListener("click", () => { sidebar.classList.add("collapsed"); tab.classList.remove("hidden"); });
  tab.addEventListener("click", openSidebar);
  tab.classList.add("hidden");

  map.on("moveend", () => { if (!state.lasso && !state.curationView) renderList(); });

  on("refresh", renderList);
  on("refresh-list", renderList);
  on("open-sidebar", openSidebar);
  on("place-selected", ({ id, openList }) => {
    state.selectedId = id;
    if (openList) openSidebar();
    selectCard(id);
  });
}
