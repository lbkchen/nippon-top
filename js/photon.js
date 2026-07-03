// Photon (photon.komoot.io) — free, keyless OSM geocoder that allows typeahead.
// Leaf util: no app imports.

export async function photonSearch(q, near, limit = 6) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "en");
  if (near) {
    url.searchParams.set("lat", String(near[0]));
    url.searchParams.set("lon", String(near[1]));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const geo = await res.json();
  const seen = new Set();
  return (geo.features || []).flatMap((f) => {
    const p = f.properties || {};
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || "unnamed place";
    const where = [p.district, p.city || p.town || p.village, p.state, p.country === "Japan" ? null : p.country]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");
    const [lng, lat] = f.geometry.coordinates;
    // OSM often has node+way+relation for one venue — same name within ~1km = same place
    const key = `${name}|${lat.toFixed(2)}|${lng.toFixed(2)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, where, lat, lng }];
  });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// shared dropdown renderer for search results
export function renderResults(el, results, onPick) {
  el.innerHTML = "";
  if (!results.length) {
    el.innerHTML = '<div class="geo-empty">nothing found — try fewer words</div>';
  }
  for (const r of results) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "geo-result";
    b.innerHTML = `<span class="geo-name"></span><span class="geo-where"></span>`;
    b.querySelector(".geo-name").textContent = r.name;
    b.querySelector(".geo-where").textContent = r.where;
    b.addEventListener("click", () => onPick(r));
    el.append(b);
  }
  el.classList.remove("hidden");
}
