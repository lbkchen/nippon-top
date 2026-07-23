// Leaflet map + shared layers. No app-state imports — leaf module.
import { $ } from "./config.js";

export const map = L.map("map", { zoomControl: false, attributionControl: true });
L.control.zoom({ position: "bottomright" }).addTo(map);
map.attributionControl.setPrefix("🗾 NIPPON TOP");

L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> © <a href='https://carto.com/attributions'>CARTO</a>",
  maxZoom: 20,
}).addTo(map);

export const zoneLayer = L.layerGroup().addTo(map);
export const doodleLayer = L.layerGroup().addTo(map);

// while the map is flying or being dragged, body.map-anim lets the stylesheet
// shed paint-heavy effects (the rough-ink filter) until things settle
map.on("movestart zoomstart", () => document.body.classList.add("map-anim"));
map.on("moveend zoomend", () => document.body.classList.remove("map-anim"));

// padding that keeps flyTo targets clear of the floating UI
export const PAD = () => (window.innerWidth > 940
  ? { paddingTopLeft: [80, 90], paddingBottomRight: [430, 40] }
  : { paddingTopLeft: [20, 140], paddingBottomRight: [20, Math.round(window.innerHeight * 0.5)] });

export function containerLatLng(e) {
  const rect = $("#map").getBoundingClientRect();
  return map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
}
