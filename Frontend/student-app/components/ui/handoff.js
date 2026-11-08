// One screen handing a moment over to the next: the course page tells the chapter page its tile has
// just travelled to where the current lesson is (so the chapter page starts from that frame), and the
// chapter page tells the course page it is fading back to it. Kept for a moment only: a hand-off that
// nobody takes soon is dropped.
let pending = null;
const KEEP_MS = 3000;

export function handOff(kind, key, data = {}) {
  pending = { kind, key, data, at: Date.now() };
}

// The hand-off of this kind for this key (a chapter or course id), taken once; or null.
export function takeHandoff(kind, key) {
  const now = pending;
  if (!now || now.kind !== kind || now.key !== key || Date.now() - now.at > KEEP_MS) return null;
  pending = null;
  return now.data;
}
