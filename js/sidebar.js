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
  if (state.curationView && !state.zoneFilter && !state.newFilter) {
    const c = state.curationView;
    label.textContent = `${c.emoji ? c.emoji + " " : ""}${c.name}'s map — ${n} spots`;
  } else if (state.zoneFilter) {
    label.textContent = `inside ${state.zoneFilter.name} — ${n} spot${n === 1 ? "" : "s"}`;
    const clear = document.createElement("button");
    clear.className = "ctx-btn";
    clear.textContent = "clear";
    clear.onclick = () => emit("zone-filter-clear");
    bar.append(label, clear);
    return;
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
  } else if (state.newFilter) {
    label.textContent = `${n} new since ${state.newFilter.since}`;
    const clear = document.createElement("button");
    clear.className = "ctx-btn";
    clear.textContent = "clear";
    clear.onclick = () => emit("newfilter-clear");
    bar.append(label, clear);
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
    ${p.notes && p.notes.length > 420 ? '<button class="card-more">the whole rant ▾</button>' : ""}
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
    wrap.innerHTML = `<div class="empty-state"><span class="big">🍥</span>nothing here…<br>zoom out, clear filters, or pan somewhere tastier</div>`;
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

  // mobile: map-first modes want the whole map — tuck the sheet away
  // (lasso results / zone filters pop it back up via open-sidebar)
  on("mode-changed", (m) => {
    if (window.innerWidth <= 940 && ["lasso", "pen", "zone", "curate"].includes(m)) {
      sidebar.classList.add("collapsed");
      tab.classList.remove("hidden");
    }
  });

  // --- mobile drag-sheet: snap to half / full / away ---
  // (--sheet-h keeps the curate bar riding on top of whatever height sticks)
  // the pill is just the affordance — the whole head is the handle. head drags
  // ask for a few px of slop first, so taps on filters/context buttons in there
  // still read as taps and not micro-drags
  const setSheetH = (px) => {
    sidebar.style.height = `${px}px`;
    document.documentElement.style.setProperty("--sheet-h", `${px}px`);
  };
  const sheetDragFrom = (el, slop) => el.addEventListener("pointerdown", (e) => {
    if (slop && window.innerWidth > 940) return; // head-as-handle only exists where the sheet does
    const startY = e.clientY;
    const startH = sidebar.getBoundingClientRect().height;
    let h = startH;
    let live = !slop;
    const engage = () => {
      live = true;
      sidebar.style.transition = "none";
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic/stale pointer — window listeners still work */ }
    };
    if (live) { e.preventDefault(); engage(); }
    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!live) {
        if (Math.abs(ev.clientY - startY) < slop) return;
        engage();
      }
      h = Math.min(window.innerHeight * 0.9, Math.max(70, startH + (startY - ev.clientY)));
      sidebar.style.height = `${h}px`;
    };
    const done = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      if (!live) return; // never left the slop — that was a tap, leave it be
      // a real drag shouldn't also press whatever button the finger lifted on
      const squelch = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
      el.addEventListener("click", squelch, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", squelch, { capture: true }), 0);
      const half = Math.round(window.innerHeight * 0.46);
      // full stops short of the toolbar stack — sheets shouldn't eat the controls
      const full = Math.min(Math.round(window.innerHeight * 0.85), window.innerHeight - 214);
      sidebar.style.transition = "height 0.22s ease, transform 0.25s ease";
      if (h < half * 0.55) {
        setSheetH(half); // next open comes back at the normal half height
        sidebar.classList.add("collapsed");
        tab.classList.remove("hidden");
      } else {
        setSheetH(Math.abs(h - half) <= Math.abs(h - full) ? half : full);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
  });
  sheetDragFrom($("#sheetGrab"), 0);
  sheetDragFrom($(".sidebar-head"), 8);
  // crossing back to desktop hands sizing back to the stylesheet
  window.addEventListener("resize", () => {
    if (window.innerWidth > 940) {
      sidebar.style.height = "";
      document.documentElement.style.removeProperty("--sheet-h");
    }
  });

  // --- mobile filters disclosure (the chips eat two rows otherwise) ---
  const filtersToggle = $("#filtersToggle");
  filtersToggle.addEventListener("click", () => {
    const open = $(".filter-row").classList.toggle("open");
    filtersToggle.textContent = open ? "filters ▴" : "filters ▾";
    filtersToggle.setAttribute("aria-expanded", open);
  });

  map.on("moveend", () => { if (!state.lasso && !state.curationView && !state.zoneFilter && !state.newFilter) renderList(); });

  on("refresh", renderList);
  on("refresh-list", renderList);
  on("open-sidebar", openSidebar);
  on("place-selected", ({ id, openList }) => {
    state.selectedId = id;
    if (openList) openSidebar();
    selectCard(id);
  });
}
