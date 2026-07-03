// Tiny event bus — modules talk through this instead of importing each other.
const bus = new EventTarget();

export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));

/*
 * Events in circulation:
 *   refresh            — full redraw (pins + list)
 *   refresh-list       — sidebar list only
 *   place-selected     — {id, fly} highlight a place everywhere
 *   place-removed      — {id} custom place deleted
 *   mode-changed       — current tool mode (string|null)
 *   toggle-zones / toggle-chains / export / open-curations / roulette — toolbar intents
 *   mix-toggle         — {id} toggle place in the active curation/mix edit
 */
