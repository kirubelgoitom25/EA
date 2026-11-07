// The course page's drifting line, as plain numbers (no React), so it can be tested.
//
// Why it is not an animated <Svg> any more: react-native-svg on Android repaints a whole <Svg>
// into a fresh bitmap on every change. The line's <Svg> is as tall as the whole course, so every
// step of the drift repainted the page: on the emulator the course page ran at 12 frames a second
// with the main thread saturated. Instead each dash is a small native view, moved along the curve
// by the native animation driver: nothing is repainted, the GPU only moves small layers.
//
// It is drawn the same way the dashed <Path> was: dashes `on` dp long with round caps `dot` dp
// thick, one every `period` dp along the same Bezier curves, drifting forward one period per loop.
// The line's two ends and the point where the done (moss) part meets the rest all sit under step
// tiles, so the only places a dash view could differ from a stroked dash are covered.

import { bezierPoint, segment } from "./pathModel.js";

export const BAND_DP = 320; // about half a phone screen
export const STEPS = [0, 0.25, 0.5, 0.75, 1]; // where along one loop each dash's path is sampled

// The path as a fine polyline with its length at every sample, measured like pathLength does.
// ends[i] is the length from the start to points[i + 1].
export function trackOf(points, curve = "spline", samples = 96) {
  const xs = [];
  const ys = [];
  const at = [];
  const ends = [];
  if (points.length < 2) return { xs, ys, at, ends, length: 0 };
  let length = 0;
  xs.push(points[0].x);
  ys.push(points[0].y);
  at.push(0);
  for (let i = 0; i < points.length - 1; i += 1) {
    const piece = segment(points, i, curve);
    for (let s = 1; s <= samples; s += 1) {
      const pt = bezierPoint(piece, s / samples);
      length += Math.hypot(pt.x - xs[xs.length - 1], pt.y - ys[ys.length - 1]);
      xs.push(pt.x);
      ys.push(pt.y);
      at.push(length);
    }
    ends.push(length);
  }
  return { xs, ys, at, ends, length };
}

// Position and direction (degrees) at distance s along the track, held at the ends.
export function pointOnTrack(track, s) {
  const { xs, ys, at, length } = track;
  const d = Math.min(Math.max(s, 0), length);
  let lo = 0;
  let hi = at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = at[hi] - at[lo] || 1;
  const t = (d - at[lo]) / span;
  return {
    x: xs[lo] + (xs[hi] - xs[lo]) * t,
    y: ys[lo] + (ys[hi] - ys[lo]) * t,
    angle: (Math.atan2(ys[hi] - ys[lo], xs[hi] - xs[lo]) * 180) / Math.PI,
  };
}

// Every dash the line ever shows, with where it is at each of STEPS through one loop.
// A dash starts `on` dp long at k * period (offset 0) and moves forward one period per loop,
// exactly as strokeDashoffset 0 -> -period did. Seen beyond either end it is hidden (alpha 0),
// as a stroke ends with its path.
export function dashesAlong(track, { period, on, doneLength = 0, bands = null }) {
  const dashes = [];
  if (track.length <= 0) return dashes;
  const first = -1;
  const lastIndex = Math.floor(track.length / period);
  for (let k = first; k <= lastIndex; k += 1) {
    const xs = [];
    const ys = [];
    const angles = [];
    const alphas = [];
    for (const step of STEPS) {
      const centre = k * period + on / 2 + step * period;
      const p = pointOnTrack(track, centre);
      xs.push(round(p.x));
      ys.push(round(p.y));
      // Keep turning the short way: an angle that wrapped from 179 to -179 would spin the dash.
      const prev = angles[angles.length - 1];
      let angle = p.angle;
      if (prev !== undefined) while (angle - prev > 180) angle -= 360;
      if (prev !== undefined) while (prev - angle > 180) angle += 360;
      angles.push(round(angle));
      alphas.push(centre >= 0 && centre <= track.length ? 1 : 0);
    }
    const middle = k * period + on / 2 + period / 2;
    dashes.push({
      key: k,
      xs,
      ys,
      angles,
      alphas,
      fades: alphas.some((a) => a === 0),
      done: doneLength > 0 && middle <= doneLength,
      band: bands ? bandOf(bands, Math.min(...ys), Math.max(...ys)) : 0,
    });
  }
  return dashes;
}

const round = (n) => Math.round(n * 100) / 100;

function bandOf(bands, top, bottom) {
  const mid = (top + bottom) / 2;
  const found = bands.find((band) => mid >= band.top && mid < band.top + band.height);
  return found ? found.index : bands.length - 1;
}

// Strips of whole physical pixels down the route. Only dashes in strips on or next to the screen
// move; the others hold still where nobody sees them, and start moving a strip before they show.
export function bandsFor(totalHeight, pixelRatio = 1) {
  const px = Math.max(1, Math.round(BAND_DP * pixelRatio));
  const height = px / pixelRatio;
  const bands = [];
  for (let top = 0, index = 0; top < totalHeight; top += height, index += 1) {
    bands.push({ index, top, height: Math.min(height, totalHeight - top) });
  }
  return bands;
}

// Strips within one strip of the screen. Without a known screen position, all of them.
export function bandsNear(bands, scrollTop, viewHeight) {
  if (scrollTop == null || viewHeight == null) return new Set(bands.map((band) => band.index));
  const margin = bands[0]?.height ?? BAND_DP;
  const from = scrollTop - margin;
  const to = scrollTop + viewHeight + margin;
  return new Set(bands.filter((band) => band.top < to && band.top + band.height > from).map((band) => band.index));
}

export function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
