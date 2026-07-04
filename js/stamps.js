// The stamp drawer: hand-drawn hanko-style seals. Leaf data module — no imports.
// Every stamp paints with currentColor (the picked ink) and gets the rough-ink
// filter + multiply blend from CSS, so they land like actual rubber stamps.
// Not emojis. Never emojis.
const S = (inner) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const seal = `<circle cx="24" cy="24" r="20.5" />`;
const sq = `<rect x="4.5" y="4.5" width="39" height="39" rx="7" />`;
const petal = `M24 21.5 C21 18.5 21.2 13.6 24 11 C26.8 13.6 27 18.5 24 21.5 Z`;

// picker fills a 4-wide grid — rows read: verdicts / eating / sights / getting around
export const STAMPS = {
  itadaki: {
    label: "頂 — certified the top",
    svg: S(`${seal}<text x="24" y="32" text-anchor="middle" font-family="'DotGothic16', monospace" font-size="22" fill="currentColor" stroke="none">頂</text>`),
  },
  banger: {
    label: "banger seal",
    svg: S(`${sq}<path d="M24 11 L27.7 18.9 L36.3 20 L30 26 L31.7 34.5 L24 30.3 L16.3 34.5 L18 26 L11.7 20 L20.3 18.9 Z" fill="currentColor" stroke="none" />`),
  },
  heart: {
    label: "beloved",
    svg: S(`${seal}<path d="M24 33.5 C13.5 26.5 15.5 16.8 21.2 16.8 C23.3 16.8 24 18.6 24 18.6 C24 18.6 24.7 16.8 26.8 16.8 C32.5 16.8 34.5 26.5 24 33.5 Z" fill="currentColor" stroke="none" />`),
  },
  nope: {
    label: "overrated, skip",
    svg: S(`${sq}<path d="M15.5 15.5 L32.5 32.5 M32.5 15.5 L15.5 32.5" stroke-width="3.2" />`),
  },
  ramen: {
    label: "slurps happened here",
    svg: S(`${seal}<path d="M12.5 24.5 C12.5 31.5 17.5 36.5 24 36.5 C30.5 36.5 35.5 31.5 35.5 24.5 Z" />
      <path d="M15.5 20.8 C20 19.6 28 19.6 32.5 20.8" stroke-width="2.2" />
      <path d="M19 16.5 C19 14.5 20.4 14 20.4 12.2 M24.5 16.5 C24.5 14.5 25.9 14 25.9 12.2 M30 16.5 C30 14.5 31.4 14 31.4 12.2" stroke-width="2" />`),
  },
  onigiri: {
    label: "snack checkpoint",
    svg: S(`${sq}<path d="M24 11.5 C25.8 11.5 27.2 12.6 28.4 14.5 L34.8 24.7 C36.8 27.9 35.2 31.5 31.6 31.5 H16.4 C12.8 31.5 11.2 27.9 13.2 24.7 L19.6 14.5 C20.8 12.6 22.2 11.5 24 11.5 Z" />
      <path d="M20.5 26 H27.5 V31.5 H20.5 Z" fill="currentColor" stroke="none" />`),
  },
  kanpai: {
    label: "kanpai happened",
    svg: S(`${seal}<path d="M17.5 18.5 H28.5 V32 C28.5 33.4 27.4 34.5 26 34.5 H20 C18.6 34.5 17.5 33.4 17.5 32 Z" />
      <path d="M28.5 21.5 H31 C32.4 21.5 33.5 22.6 33.5 24 V26.5 C33.5 27.9 32.4 29 31 29 H28.5" stroke-width="2.2" />
      <path d="M15.5 18.5 C15.5 15.8 18 14.6 19.8 15.6 C20.5 13 24.5 12.6 25.3 15 C27.5 13.6 30.6 15.2 30.4 18.5" stroke-width="2.2" />
      <circle cx="18" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="23.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="28.5" cy="11" r="1" fill="currentColor" stroke="none" />`),
  },
  camera: {
    label: "camera ate first",
    svg: S(`${seal}<rect x="12.5" y="18" width="23" height="15.5" rx="3" />
      <path d="M19 18 L21 14.5 H27 L29 18" />
      <circle cx="24" cy="25.5" r="4.8" />
      <circle cx="32" cy="21.5" r="1.1" fill="currentColor" stroke="none" />`),
  },
  torii: {
    label: "shrine gate energy",
    svg: S(`${sq}<path d="M11 15.5 C17 13.8 31 13.8 37 15.5" />
      <path d="M13.5 21 H34.5" stroke-width="2.2" />
      <path d="M16.5 21 L15.5 36 M31.5 21 L32.5 36" />
      <path d="M24 15 V21" stroke-width="2.2" />`),
  },
  onsen: {
    label: "get in the water",
    svg: S(`${seal}<path d="M12.5 31.5 C12.5 35 35.5 35 35.5 31.5" />
      <path d="M12.5 31.5 C12.5 28.5 35.5 28.5 35.5 31.5" stroke-width="2.2" />
      <path d="M17.5 24.5 C16 22 19 20.5 17.5 17.5 M24 24.5 C22.5 22 25.5 20.5 24 17.5 M30.5 24.5 C29 22 32 20.5 30.5 17.5" stroke-width="2.2" />`),
  },
  fuji: {
    label: "fuji was out",
    svg: S(`${sq}<path d="M9.5 33.5 C13 27 16.5 21 19.5 15.8 C21.7 12 26.3 12 28.5 15.8 C31.5 21 35 27 38.5 33.5" />
      <path d="M9.5 33.5 H38.5" stroke-width="2.2" />
      <path d="M17.8 20.5 L20.6 23 L24 19.8 L27.4 23 L30.2 20.5" stroke-width="2.2" />`),
  },
  sakura: {
    label: "sakura szn",
    svg: S(`${seal}<path d="${petal}" /><path d="${petal}" transform="rotate(72 24 24)" /><path d="${petal}" transform="rotate(144 24 24)" /><path d="${petal}" transform="rotate(216 24 24)" /><path d="${petal}" transform="rotate(288 24 24)" /><circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />`),
  },
  go: {
    label: "GO HERE",
    svg: S(`${sq}<path d="M11.5 24 H32" stroke-width="3" />
      <path d="M26 16.5 L34 24 L26 31.5" stroke-width="3" />
      <path d="M11.5 16.5 H17 M11.5 31.5 H17" stroke-width="2.2" />`),
  },
  densha: {
    label: "worth the train ride",
    svg: S(`${sq}<path d="M8.5 30.5 C8.5 22.5 15 17.5 24 17.5 H33 C36.6 17.5 39.5 20.4 39.5 24 V28 C39.5 29.4 38.4 30.5 37 30.5 Z" />
      <path d="M14.5 22.5 H31" stroke-width="2.2" />
      <path d="M12 34 H15.5 M21 34 H24.5 M30 34 H33.5" stroke-width="2.2" />`),
  },
  neko: {
    label: "cat approved",
    svg: S(`${seal}<path d="M14.5 21 L13 12.5 L19.5 15.2 M33.5 21 L35 12.5 L28.5 15.2" />
      <path d="M14.5 19.5 C12.8 25 15.5 31.5 24 31.5 C32.5 31.5 35.2 25 33.5 19.5 C31.5 15.5 27.5 14 24 14 C20.5 14 16.5 15.5 14.5 19.5 Z" />
      <circle cx="19.8" cy="21.8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="28.2" cy="21.8" r="1.5" fill="currentColor" stroke="none" />
      <path d="M24 24.5 C23.2 26 21.8 26 21 25.2 M24 24.5 C24.8 26 26.2 26 27 25.2" stroke-width="2" />
      <path d="M9.5 21.5 L14 22 M9.5 25.5 L14.2 25 M38.5 21.5 L34 22 M38.5 25.5 L33.8 25" stroke-width="2" />`),
  },
  yen: {
    label: "wallet damage",
    svg: S(`${sq}<path d="M16.5 11.5 L24 21.5 L31.5 11.5" stroke-width="3" />
      <path d="M24 21.5 V36" stroke-width="3" />
      <path d="M17 25.5 H31 M17 30.5 H31" stroke-width="2.6" />`),
  },
};
