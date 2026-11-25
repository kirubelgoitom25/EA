// The geometry of a path of steps, pure so it is easy to test. Steps run down the screen on a
// meandering line that sweeps from one side of the screen to the other in long, slow waves. The line
// is one smooth curve through every step (it does not turn at a step, it flows through it), so the
// path reads as a river of stones and not as a zigzag.

export const SWAY = 0.28; // how far steps drift from the middle, as a share of the path's width
export const WAVE = 0.8; // how fast the line weaves: about one full wave every 8 steps
export const ROW = 148; // a step's row
export const BUBBLE = 44; // extra room over the current step for its start bubble
export const PART = 48; // extra room before a step that starts a new part, for the dome between
export const NODE_TOP = 56; // from the top of a step's row to the middle of its rock
export const DEN = 148;

export const xOf = (i, width) => width * (0.5 + SWAY * Math.sin(i * WAVE));

// Which side of its rock a step's words go: the side with more room.
export const wordsSide = (i) => (Math.sin(i * WAVE) < 0 ? "right" : "left");

export const FOX_ROOM = 60; // extra room over the current step when the fox stands on top of it
export const PEEK_ROOM = 84; // room over a first step that has the fox's head peeking over it
export const PEEK_PART = 40; // more room for a part's dome when the fox's head is peeking right under it

// The trail (every path screen; 2026-11-11 handoff 5a, positions from the 2026-11-12 path fixes): tiles
// zig-zag through four spots, x = 96, 270, 150, 280 on a 390 wide screen, then again. Every step sits on
// the other side from the one before it, including where the cycle wraps (280 back to 96), so every
// stretch of road sweeps across the screen (the smallest sideways move is 120). The rows step down 105
// to 140 dp. Everything is laid out on the 390 wide reference and scaled with the screen's width, like
// the background tile behind it. Two kinds of path:
// - course: a path of chapters (Home and a course page); first tile at 74 under the scenery's top
// - chapter: a path of lessons, two-line labels, so a little more room; first tile at 88
export const REF_WIDTH = 390;
export const TRAIL_X = [96, 270, 150, 280];
export const TRAIL = {
  course: { first: 74, row: 105, aboveNext: 27, belowNext: 23, den: 140, end: 70 },
  chapter: { first: 88, row: 120, aboveNext: 22, belowNext: 18, den: 140, end: 70 },
};
export const FIRST_FOX = 60; // more room over a first step that is the current one, for the fox's head
// kept for the older tests and callers: the course trail's rows
export const ZIG = TRAIL.course;

// x of a step numbered `number` (1, 2, ...) on the trail. `frame` is the screen's width; the path itself
// is `width` wide and centred in it.
export const zigX = (number, width, frame = width) => {
  const n = TRAIL_X.length;
  const spot = TRAIL_X[(((Math.round(number) - 1) % n) + n) % n];
  return (frame * spot) / REF_WIDTH - (frame - width) / 2;
};

const trailOf = (zig) => TRAIL[typeof zig === "string" ? zig : "course"];

// The trail's rows: centers[i] the y of step i's middle, den its end, total the path's height.
function layoutTrail(items, foxAbove, zig, frame) {
  const t = trailOf(zig);
  const s = frame / REF_WIDTH;
  const centers = [];
  let lead = 0; // extra room over the first step (its dome, the fox's head): the artwork moves down by it too
  items.forEach((item, i) => {
    const part = item.eyebrow ? PART : 0;
    if (i === 0) {
      lead = (part + (item.status === "next" && foxAbove ? FIRST_FOX : 0)) * s;
      centers.push(t.first * s + lead);
      return;
    }
    const gap = t.row + part + (item.status === "next" ? t.aboveNext : 0) + (items[i - 1].status === "next" ? t.belowNext : 0);
    centers.push(centers[i - 1] + gap * s);
  });
  const last = centers.length ? centers[centers.length - 1] : 0;
  const denCenter = last + t.den * s;
  return {
    offsets: centers.map((c) => c - NODE_TOP),
    centers,
    den: { top: denCenter - 24, center: denCenter },
    total: denCenter + t.end * s,
    lead,
  };
}

const extraAbove = (item, cta, foxAbove, zig = false, first = false) => {
  const next = item.status === "next";
  let fox = 0;
  if (next && foxAbove) fox = first ? PEEK_ROOM : zig ? ZIG.aboveNext + (item.eyebrow ? PEEK_PART : 0) : FOX_ROOM;
  // the zigzag puts the start bubble beside the step, under its words, so it needs no room above
  return (item.eyebrow ? PART : 0) + (next && cta && !zig ? BUBBLE : 0) + fox;
};

export const rowHeight = (item, cta, foxAbove = false, zig = false, first = false) =>
  extraAbove(item, cta, foxAbove, zig, first) + (zig ? ZIG.row + (item.status === "next" ? ZIG.belowNext : 0) : ROW);

// Where everything sits down the path: offsets[i] is the top of step i, centers[i] the y of its
// rock's middle; den is the end of the path. total is the height of the whole path.
// foxAbove: the fox is on top of the current step (Home), so its row has room for her.
// zig: the zigzag rows (Home).
export function layoutPath(items, cta = true, foxAbove = false, zig = false, frame = REF_WIDTH) {
  if (zig) return layoutTrail(items, foxAbove, zig, frame);
  let y = 0;
  const offsets = [];
  const centers = [];
  items.forEach((item, i) => {
    offsets.push(y);
    centers.push(y + extraAbove(item, cta, foxAbove, zig, i === 0) + NODE_TOP);
    y += rowHeight(item, cta, foxAbove, zig, i === 0);
  });
  return { offsets, centers, den: { top: y, center: y + NODE_TOP }, total: y + DEN };
}

// Points the path passes through: every step's rock, then the den's.
// zig: { frame, trail } for the trail, frame being the screen's width and trail "course" | "chapter";
// steps sit by their number.
export function pathPoints(items, hasDen, width, cta = true, foxAbove = false, zig = null) {
  const layout = layoutPath(items, cta, foxAbove, zig ? zig.trail ?? "course" : false, zig?.frame ?? REF_WIDTH);
  const numberOf = (i) => items[i]?.number ?? (items[0]?.number ?? 1) + i;
  const x = (i) => (zig ? zigX(numberOf(i), width, zig.frame) : xOf(i, width));
  const points = layout.centers.map((y, i) => ({ x: x(i), y }));
  if (hasDen) points.push({ x: zig ? zigX(numberOf(items.length - 1) + 1, width, zig.frame) : xOf(items.length, width), y: layout.den.center });
  return { layout, points };
}

// The piece of curve from points[i] to points[i + 1] as a cubic Bezier: [start, handle, handle, end].
// The handles follow the direction of travel through each point (a Catmull-Rom spline), which is what
// makes the line flow through the steps. curve "s" (the zigzag) instead leaves and enters every step
// straight down, half the drop out, so each piece is one soft S from side to side.
export function segment(points, i, curve = "spline") {
  const p1 = points[i];
  const p2 = points[i + 1];
  if (curve === "s") {
    const half = (p2.y - p1.y) / 2;
    return [p1, { x: p1.x, y: p1.y + half }, { x: p2.x, y: p2.y - half }, p2];
  }
  const p0 = points[i - 1] ?? p1;
  const p3 = points[i + 2] ?? p2;
  return [
    p1,
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
    p2,
  ];
}

// A point on a Bezier piece, t in 0..1.
export function bezierPoint([a, b, c, d], t) {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: w[0] * a.x + w[1] * b.x + w[2] * c.x + w[3] * d.x, y: w[0] * a.y + w[1] * b.y + w[2] * c.y + w[3] * d.y };
}

// A point anywhere along the path: k = 1.5 is halfway between the second and third step.
export function pointAt(points, k, curve = "spline") {
  if (!points.length) return { x: 0, y: 0 };
  const clamped = Math.max(0, Math.min(points.length - 1, k));
  const i = Math.min(Math.floor(clamped), points.length - 2);
  if (i < 0) return points[0];
  return bezierPoint(segment(points, i, curve), clamped - i);
}

// The path through points from..to as one SVG path (one piece, so a dotted line keeps its rhythm
// from the first dot to the last).
export function pathD(points, from = 0, to = points.length - 1, curve = "spline") {
  if (to <= from || !points.length) return "";
  const f = (n) => n.toFixed(1);
  let d = `M${f(points[from].x)} ${f(points[from].y)}`;
  for (let i = from; i < to; i += 1) {
    const [, b, c, e] = segment(points, i, curve);
    d += ` C${f(b.x)} ${f(b.y)} ${f(c.x)} ${f(c.y)} ${f(e.x)} ${f(e.y)}`;
  }
  return d;
}

// How long the path from..to is, in dp, measured along the same curves pathD draws (each piece
// sampled finely; plenty for timing dots along it).
export function pathLength(points, from = 0, to = points.length - 1, curve = "spline", samples = 48) {
  let length = 0;
  for (let i = from; i < to; i += 1) {
    const piece = segment(points, i, curve);
    let prev = piece[0];
    for (let s = 1; s <= samples; s += 1) {
      const pt = bezierPoint(piece, s / samples);
      length += Math.hypot(pt.x - prev.x, pt.y - prev.y);
      prev = pt;
    }
  }
  return length;
}

// How far the path has been travelled, as the index of the last point reached: the steps done in a
// row from the start, ending at the one you are at now; the den (one past the last step) once it is
// reached. -1 when nothing is.
export function travelled(items, den) {
  let last = -1;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].status === "done") last = i;
    else {
      // the path ends where you stand; a step done after it does not extend it
      if (items[i].status === "next") last = i;
      return last;
    }
  }
  return den?.reached ? items.length : last;
}

// The trail's road (2026-11-12 path fixes, section 3): separate round dots, never a dashed stroke. Along
// each stretch (the "s" curve from one step's middle to the next one's) a dot every ROAD.step dp, the
// first ROAD.start in. Distance is measured along the curve itself (sampled finely and added up), not by
// the Bezier's parameter, so the dots do not bunch up on the bends. A dot whose middle falls inside
// either end's box is left out, so none pokes out from behind a tile.
// boxes[i]: { left, top, right, bottom } around point i (see roadBox), or null for no box; also: more
// boxes anywhere on the path (a part's dome sitting halfway along a stretch), kept clear the same way.
// Returns [{ x, y, seg }], seg being the stretch the dot is on (from point seg to seg + 1).
export const ROAD = { radius: 4.5, step: 18, start: 9, pad: 3, padBelow: 9 };
const ROAD_SAMPLES = 160;

const inside = (box, pt) => !!box && pt.x >= box.left && pt.x <= box.right && pt.y >= box.top && pt.y <= box.bottom;

export function roadDots(points, boxes = [], also = []) {
  const dots = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const piece = segment(points, i, "s");
    let prev = piece[0];
    let walked = 0;
    let want = ROAD.start;
    for (let s = 1; s <= ROAD_SAMPLES; s += 1) {
      const pt = bezierPoint(piece, s / ROAD_SAMPLES);
      const run = Math.hypot(pt.x - prev.x, pt.y - prev.y);
      while (run > 0 && walked + run >= want) {
        const t = (want - walked) / run;
        const dot = { x: prev.x + (pt.x - prev.x) * t, y: prev.y + (pt.y - prev.y) * t, seg: i };
        if (!inside(boxes[i], dot) && !inside(boxes[i + 1], dot) && !also.some((box) => inside(box, dot))) dots.push(dot);
        want += ROAD.step;
      }
      walked += run;
      prev = pt;
    }
  }
  return dots;
}

// The box the road keeps out of around a thing at (x, y): `half` either side, `top` above and `bottom`
// below its point, grown by ROAD.pad all round and by ROAD.padBelow underneath (a tile's bottom edge).
export const roadBox = (x, y, half, top, bottom) => ({
  left: x - half - ROAD.pad,
  right: x + half + ROAD.pad,
  top: y - top - ROAD.pad,
  bottom: y + bottom + ROAD.padBelow,
});
