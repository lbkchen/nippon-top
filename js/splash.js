// Title-card splash. Once per session, skippable, respects reduced motion.
import { $ } from "./config.js";

export function initSplash() {
  const el = $("#splash");
  if (!el) return;
  const forced = location.search.includes("splash"); // dev flag: ?splash pins it open
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!forced && (sessionStorage.getItem("nippon_splashed") || reduced)) { el.remove(); return; }
  sessionStorage.setItem("nippon_splashed", "1");
  el.classList.add("go");
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    el.classList.add("out");
    setTimeout(() => el.remove(), 450);
  };
  el.addEventListener("click", dismiss);
  if (!forced) setTimeout(dismiss, 2100);
}
