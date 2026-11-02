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

const extraAbove = (item, cta) => (item.eyebrow ? PART : 0) + (item.status === "next" && cta ? BUBBLE : 0);

export const rowHeight = (item, cta) => extraAbove(item, cta) + ROW;

// Where everything sits down the path: offsets[i] is the top of step i, centers[i] the y of its
// rock's middle; den is the end of the path. total is the height of the whole path.
export function layoutPath(items, cta = true) {
  let y = 0;
  const offsets = [];
  const centers = [];
  items.forEach((item) => {
    offsets.push(y);
    centers.push(y + extraAbove(item, cta) + NODE_TOP);
    y += rowHeight(item, cta);
  });
  return { offsets, centers, den: { top: y, center: y + NODE_TOP }, total: y + DEN };
}

// Points the path passes through: every step's rock, then the den's.
export function pathPoints(items, hasDen, width, cta = true) {
  const layout = layoutPath(items, cta);
  const points = layout.centers.map((y, i) => ({ x: xOf(i, width), y }));
  if (hasDen) points.push({ x: xOf(items.length, width), y: layout.den.center });
  return { layout, points };
}

// The piece of curve from points[i] to points[i + 1] as a cubic Bezier: [start, handle, handle, end].
// The handles follow the direction of travel through each point (a Catmull-Rom spline), which is what
// makes the line flow through the steps.
export function segment(points, i) {
  const p1 = points[i];
  const p2 = points[i + 1];
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
export function pointAt(points, k) {
  if (!points.length) return { x: 0, y: 0 };
  const clamped = Math.max(0, Math.min(points.length - 1, k));
  const i = Math.min(Math.floor(clamped), points.length - 2);
  if (i < 0) return points[0];
  return bezierPoint(segment(points, i), clamped - i);
}

// The path through points from..to as one SVG path (one piece, so a dotted line keeps its rhythm
// from the first dot to the last).
export function pathD(points, from = 0, to = points.length - 1) {
  if (to <= from || !points.length) return "";
  const f = (n) => n.toFixed(1);
  let d = `M${f(points[from].x)} ${f(points[from].y)}`;
  for (let i = from; i < to; i += 1) {
    const [, b, c, e] = segment(points, i);
    d += ` C${f(b.x)} ${f(b.y)} ${f(c.x)} ${f(c.y)} ${f(e.x)} ${f(e.y)}`;
  }
  return d;
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
