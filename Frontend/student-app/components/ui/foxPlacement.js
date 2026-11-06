// Where the course-path fox stands, worked out so she never covers anything you can read or tap.
// Pure: rects in, a spot out (tested in tests/foxPlacement.test.mjs).
//
// Every size is in dp for a 390 dp wide screen; k = screenWidth / 390 scales it. A rect is
// { x, y, w, h }. The silhouettes are the opaque parts of the fox images, measured as bands (from the
// top, as fractions of the image): [top, bottom, left, right].

export const BASE_WIDTH = 390;
export const scaleOf = (screenWidth) => screenWidth / BASE_WIDTH;

// fox-body.png (360 x 443), opaque bounds in 12 bands
export const BODY_BANDS = [
  [0, 0.083, 0.517, 0.867],
  [0.083, 0.167, 0.492, 0.889],
  [0.167, 0.25, 0.45, 0.931],
  [0.25, 0.333, 0.394, 0.989],
  [0.333, 0.417, 0.406, 0.975],
  [0.417, 0.5, 0.478, 0.897],
  [0.5, 0.583, 0.428, 0.944],
  [0.583, 0.667, 0.403, 0.972],
  [0.667, 0.75, 0.381, 0.997],
  [0.75, 0.833, 0.381, 0.997],
  [0.833, 0.917, 0.519, 0.872],
  [0.917, 1, 0.464, 0.911],
];

// fox-tail.png (same box as the body), opaque bounds; nothing above a third of the way down
export const TAIL_BANDS = [
  [0.333, 0.417, 0.05, 0.086],
  [0.417, 0.5, 0.014, 0.142],
  [0.5, 0.583, 0.003, 0.25],
  [0.583, 0.667, 0.003, 0.572],
  [0.667, 0.75, 0.011, 0.581],
  [0.75, 0.833, 0.05, 0.589],
  [0.833, 0.917, 0.122, 0.597],
  [0.917, 1, 0.3, 0.533],
];

// fox-head-peek.png (430 x 380), opaque bounds in 10 bands, and the flat cut along its bottom edge
export const HEAD_BANDS = [
  [0, 0.1, 0.242, 0.758],
  [0.1, 0.2, 0.202, 0.798],
  [0.2, 0.3, 0.177, 0.819],
  [0.3, 0.4, 0.16, 0.835],
  [0.4, 0.5, 0.137, 0.86],
  [0.5, 0.6, 0.086, 0.909],
  [0.6, 0.7, 0, 0.995],
  [0.7, 0.8, 0.002, 0.993],
  [0.8, 0.9, 0.028, 0.963],
  [0.9, 1, 0.13, 0.865],
];
export const HEAD_CUT = [0.258, 0.735];

// The three foxes' boxes (dp at 390) and their eyelids: [left, top] of each lid, its size, and the
// closed-eye line inside it (its left/top in the lid, width, thickness), as in the design.
export const TITLE_FOX = {
  w: 81.3,
  h: 100,
  lids: { at: [46.5, 59.6], top: 24.2, w: 6.3, h: 8, line: { left: 0.7, top: 3.3, w: 5, h: 2.5, thick: 1.3 } },
};
export const LEDGE_FOX = {
  w: 89.4,
  h: 110,
  left: 22,
  lids: { at: [51.3, 65.6], top: 26.7, w: 6.9, h: 8.7, line: { left: 0.7, top: 3.6, w: 5.5, h: 2.8, thick: 1.4 } },
};
export const EDGE_FOX = {
  w: 96,
  h: 84.4,
  rotate: -62, // degrees
  peek: 58, // how far further out she sits while hidden
  fromRight: 84, // the design puts her box 306 dp from the left of a 390 screen
  belowTile: 4, // ...and 4 dp below the current tile's middle (582 vs 578)
  lids: { at: [28.4, 54], top: 48, w: 13.3, h: 15.6, line: { left: 1.8, top: 7, w: 9.8, h: 4.5, thick: 2.2 } },
};

const MARGIN = 4; // how close she may come to anything
export const TAIL_PIVOT = [0.494, 0.84]; // the tail turns about this point of the image
const WAG_ANGLES = [-3, 0, 3, 6]; // the furthest it turns each way (and between)
const BREATH = 2; // how much taller she is at the top of a breath
const rad = (deg) => (deg * Math.PI) / 180;

export function intersects(a, b, margin = 0) {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

// The standing fox's shape as rects, for her box at (x, y) of size w x h: her body (a little taller
// for her breath), and her tail over the whole of its wag (it turns -3..+6 degrees about its root).
export function figureRects(x, y, w, h, k = 1) {
  const pad = BREATH * k;
  const body = BODY_BANDS.map(([t, b, l, r]) => ({ x: x + l * w, y: y + t * h - pad, w: (r - l) * w, h: (b - t) * h + pad }));
  const px = x + TAIL_PIVOT[0] * w;
  const py = y + TAIL_PIVOT[1] * h;
  const tail = TAIL_BANDS.map(([t, b, l, r]) => {
    const corners = [];
    for (const deg of WAG_ANGLES) {
      const c = Math.cos(rad(deg));
      const s = Math.sin(rad(deg));
      for (const [u, v] of [[l, t], [r, t], [r, b], [l, b]]) {
        const dx = x + u * w - px;
        const dy = y + v * h - py;
        corners.push({ x: px + dx * c - dy * s, y: py + dx * s + dy * c });
      }
    }
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const top = Math.min(...ys);
    const bottom = Math.min(Math.max(...ys), y + h); // the tail rests on the ground she stands on
    return { x: Math.min(...xs), y: top, w: Math.max(...xs) - Math.min(...xs), h: bottom - top };
  });
  return [...body, ...tail];
}

// Offsets to try, nearest first: 0, +s, -s, +2s, -2s, ... within [lo, hi].
function nearestFirst(lo, hi, step) {
  const out = [];
  if (lo > hi) return out;
  const start = Math.max(lo, Math.min(hi, 0));
  out.push(start);
  for (let d = step; start + d <= hi || start - d >= lo; d += step) {
    if (start + d <= hi) out.push(start + d);
    if (start - d >= lo) out.push(start - d);
  }
  return out;
}

// The "on the title" fox: her feet on top of the current step's title (its first line), her right
// side lined up with that line's end. If that would cover something (the kicker over the title, the
// step above, a label), she slides along the line, then tries standing on top of the kicker instead.
// - title: { lines: [rect] } (first line first); kicker: rect or null
// - obstacles: every rect she must stay clear of (the title and kicker are added here)
// - bounds: { left, right } she must stay inside (the screen's edges)
// Returns her box's top-left { x, y } and size, or null when there is nowhere clear.
export function placeTitleFox({ title, kicker = null, obstacles = [], bounds, k = 1 }) {
  const first = title?.lines?.[0];
  if (!first) return null;
  const w = TITLE_FOX.w * k;
  const h = TITLE_FOX.h * k;
  const right = (r) => r.x + r.w;
  const all = [...obstacles, ...title.lines, ...(kicker ? [kicker] : [])];
  const tries = [{ feet: first.y, right: right(first) }];
  if (kicker) tries.push({ feet: kicker.y, right: Math.max(right(kicker), right(first)) });

  for (const { feet, right: end } of tries) {
    const y = feet - h;
    // Only what reaches above her feet can be covered; what she stands on is below them.
    const near = all.filter((r) => r.y < feet - 0.5);
    const ideal = end - w;
    const offsets = nearestFirst(bounds.left - ideal, bounds.right - w - ideal, 2 * k);
    for (const dx of offsets) {
      const shape = figureRects(ideal + dx, y, w, h, k);
      const clear = shape.every((s) => near.every((r) => !intersects(s, r, MARGIN)));
      if (clear) return { x: ideal + dx, y, w, h };
    }
  }
  return null;
}

// --- the edge fox: her head, turned, leaning in from the side of the screen ---

// A point of the head image (fractions u, v of its box) once the box is turned about its middle.
function turned(u, v, w, h, cx, cy, deg) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const px = (u - 0.5) * w;
  const py = (v - 0.5) * h;
  return { x: cx + px * c - py * s, y: cy + px * s + py * c };
}

// The head's shape as convex quads (one per band), turned, for its box at (x, y).
export function headQuads(x, y, w, h, deg = EDGE_FOX.rotate) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return HEAD_BANDS.map(([t, b, l, r]) => [
    turned(l, t, w, h, cx, cy, deg),
    turned(r, t, w, h, cx, cy, deg),
    turned(r, b, w, h, cx, cy, deg),
    turned(l, b, w, h, cx, cy, deg),
  ]);
}

// The leftmost x of the flat cut along the head's bottom edge, for its box at (x, y).
export function cutLeft(x, y, w, h, deg = EDGE_FOX.rotate) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return Math.min(...HEAD_CUT.map((u) => turned(u, 1, w, h, cx, cy, deg).x));
}

// Does a convex polygon touch a rect (grown by margin)? Separating axis test.
export function polyHitsRect(poly, rect, margin = 0) {
  const box = [
    { x: rect.x - margin, y: rect.y - margin },
    { x: rect.x + rect.w + margin, y: rect.y - margin },
    { x: rect.x + rect.w + margin, y: rect.y + rect.h + margin },
    { x: rect.x - margin, y: rect.y + rect.h + margin },
  ];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    axes.push({ x: -(b.y - a.y), y: b.x - a.x });
  }
  const project = (pts, ax) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      const d = p.x * ax.x + p.y * ax.y;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return [lo, hi];
  };
  return axes.every((ax) => {
    const [a0, a1] = project(poly, ax);
    const [b0, b1] = project(box, ax);
    return a0 < b1 && b0 < a1;
  });
}

const flipRect = (r, width) => ({ ...r, x: width - (r.x + r.w) });

// The "edge peek" fox: her head leans in from the screen's edge beside the Continue button, in the
// design's spot relative to the current tile, pushed out just far enough that the flat cut at the
// bottom of the image stays past the edge. If she would touch Continue, the title or anything else,
// she leans further out; if that would hide too much of her, she moves down beside the button.
// - tile: { x, y } the current tile's middle; edge: the screen's right edge (in these coordinates)
// - mirrored: lean in from the left edge instead (when the current tile is on the right); then
//   width is the span the picture is mirrored across (0..width, with the screen centred on it)
// Returns { x, y, w, h, mirrored } (the unturned box's top-left), or null.
export function placeEdgeFox({ tile, edge, width, obstacles = [], mirrored = false, k = 1 }) {
  const w = EDGE_FOX.w * k;
  const h = EDGE_FOX.h * k;
  // mirrored, the left edge becomes the right one: work on the mirror image, then flip back
  const rects = mirrored ? obstacles.map((r) => flipRect(r, width)) : obstacles;
  const x0 = edge - EDGE_FOX.fromRight * k;
  const y0 = tile.y + EDGE_FOX.belowTile * k;
  // never show the flat cut: push out until its leftmost point is past the edge
  const minDx = Math.max(0, edge + 1 - cutLeft(x0, y0, w, h));
  const cap = 30 * k;
  const maxDown = 48 * k;

  for (let dy = 0; dy <= maxDown; dy += 4 * k) {
    for (let dx = minDx; dx <= minDx + cap; dx += 2 * k) {
      const quads = headQuads(x0 + dx, y0 + dy, w, h);
      const clear = quads.every((q) => rects.every((r) => !polyHitsRect(q, r, MARGIN)));
      if (clear) {
        const x = x0 + dx;
        return { x: mirrored ? width - (x + w) : x, y: y0 + dy, w, h, mirrored };
      }
    }
  }
  return null;
}
