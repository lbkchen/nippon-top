// The stamp drawer: hand-drawn hanko-style seals. Leaf data module — no imports.
// Every stamp paints with currentColor (the picked ink) and gets the rough-ink
// filter + multiply blend from CSS, so they land like actual rubber stamps.
// Not emojis. Never emojis.
const S = (inner) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const seal = `<circle cx="24" cy="24" r="20.5" />`;
const sq = `<rect x="4.5" y="4.5" width="39" height="39" rx="7" />`;

export const STAMPS = {
  itadaki: {
    label: "頂 — certified the top",
    svg: S(`${seal}<text x="24" y="32" text-anchor="middle" font-family="'DotGothic16', monospace" font-size="22" fill="currentColor" stroke="none">頂</text>`),
  },
  banger: {
    label: "banger seal",
    svg: S(`${sq}<path d="M24 11 L27.7 18.9 L36.3 20 L30 26 L31.7 34.5 L24 30.3 L16.3 34.5 L18 26 L11.7 20 L20.3 18.9 Z" fill="currentColor" stroke="none" />`),
  },
  ramen: {
    label: "slurps happened here",
    svg: S(`${seal}<path d="M12.5 24.5 C12.5 31.5 17.5 36.5 24 36.5 C30.5 36.5 35.5 31.5 35.5 24.5 Z" />
      <path d="M15.5 20.8 C20 19.6 28 19.6 32.5 20.8" stroke-width="2.2" />
      <path d="M19 16.5 C19 14.5 20.4 14 20.4 12.2 M24.5 16.5 C24.5 14.5 25.9 14 25.9 12.2 M30 16.5 C30 14.5 31.4 14 31.4 12.2" stroke-width="2" />`),
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
  go: {
    label: "GO HERE",
    svg: S(`${sq}<path d="M11.5 24 H32" stroke-width="3" />
      <path d="M26 16.5 L34 24 L26 31.5" stroke-width="3" />
      <path d="M11.5 16.5 H17 M11.5 31.5 H17" stroke-width="2.2" />`),
  },
  heart: {
    label: "beloved",
    svg: S(`${seal}<path d="M24 33.5 C13.5 26.5 15.5 16.8 21.2 16.8 C23.3 16.8 24 18.6 24 18.6 C24 18.6 24.7 16.8 26.8 16.8 C32.5 16.8 34.5 26.5 24 33.5 Z" fill="currentColor" stroke="none" />`),
  },
  nope: {
    label: "overrated, skip",
    svg: S(`${sq}<path d="M15.5 15.5 L32.5 32.5 M32.5 15.5 L15.5 32.5" stroke-width="3.2" />`),
  },
};
