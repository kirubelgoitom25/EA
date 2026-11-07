import test from "node:test";
import assert from "node:assert/strict";
import { BAND_DP, STEPS, bandsFor, bandsNear, dashesAlong, pointOnTrack, sameSet, trackOf } from "../components/ui/driftModel.js";
import { pathLength, pathPoints } from "../components/ui/pathModel.js";

const items = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, status: i < 2 ? "done" : i === 2 ? "next" : "todo", title: `Chapter ${i + 1}` }));
const { layout, points } = pathPoints(items, true, 342, true, false, { frame: 390 });

test("the track measures the same curves the line is drawn with", () => {
  const track = trackOf(points, "s");
  const drawn = pathLength(points, 0, points.length - 1, "s", 400);
  assert.ok(Math.abs(track.length - drawn) / drawn < 0.001, `${track.length} vs ${drawn}`);
  assert.equal(track.ends.length, points.length - 1);
  assert.ok(Math.abs(track.ends[1] - pathLength(points, 0, 2, "s", 400)) < 0.5);
});

test("points along the track sit on the curve, held at the ends", () => {
  const track = trackOf(points, "s");
  const start = pointOnTrack(track, -50);
  assert.deepEqual([start.x, start.y], [points[0].x, points[0].y]);
  const end = pointOnTrack(track, track.length + 50);
  const last = points[points.length - 1];
  assert.ok(Math.abs(end.x - last.x) < 1e-6 && Math.abs(end.y - last.y) < 1e-6);
  // the zigzag leaves each step straight down
  assert.ok(Math.abs(pointOnTrack(track, 1).angle - 90) < 2);
});

test("dashes sit one period apart and each moves exactly one period per loop", () => {
  const track = trackOf(points, "s");
  const dashes = dashesAlong(track, { period: 14, on: 2 });
  const byKey = new Map(dashes.map((d) => [d.key, d]));
  for (const d of dashes) {
    const next = byKey.get(d.key + 1);
    if (!next) continue;
    // the end of one loop is where the next dash started: the loop is seamless
    assert.ok(Math.abs(d.xs[4] - next.xs[0]) < 0.02 && Math.abs(d.ys[4] - next.ys[0]) < 0.02, `dash ${d.key}`);
    assert.equal(d.xs.length, STEPS.length);
  }
  // every dash ever visible is there, from one entering at the start to one leaving at the end
  assert.equal(dashes[0].key, -1);
  assert.ok(dashes[dashes.length - 1].key * 14 + 1 >= track.length - 14);
});

test("dashes are hidden past the ends, as a stroke stops at its path's end", () => {
  const track = trackOf(points, "s");
  const dashes = dashesAlong(track, { period: 14, on: 2 });
  assert.deepEqual(dashes[0].alphas, [0, 0, 0, 0, 1]); // centre at -12 .. +1
  assert.ok(dashes.filter((d) => d.fades).length <= 3);
  for (const d of dashes.slice(1, -2)) assert.deepEqual(d.alphas, [1, 1, 1, 1, 1]);
});

test("angles never jump a full turn, so no dash spins", () => {
  const track = trackOf(points, "s");
  for (const d of dashesAlong(track, { period: 14, on: 2 })) {
    for (let i = 1; i < d.angles.length; i += 1) assert.ok(Math.abs(d.angles[i] - d.angles[i - 1]) <= 180);
  }
});

test("dashes before the current step are moss, the rest stone", () => {
  const track = trackOf(points, "s");
  const doneLength = track.ends[1]; // up to the third step
  const dashes = dashesAlong(track, { period: 14, on: 2, doneLength });
  const done = dashes.filter((d) => d.done);
  assert.ok(done.length > 0 && done.length < dashes.length);
  assert.ok(done.every((d) => d.key * 14 + 1 + 7 <= doneLength));
  assert.equal(dashesAlong(track, { period: 14, on: 2, doneLength: 0 }).some((d) => d.done), false);
});

test("bands cover the route edge to edge on whole pixels, and only those near the screen move", () => {
  for (const ratio of [1, 1.5, 2, 2.625, 2.75, 3, 3.5]) {
    const bands = bandsFor(layout.total, ratio);
    for (let i = 1; i < bands.length; i += 1) {
      assert.equal(bands[i].top, bands[i - 1].top + bands[i - 1].height);
      const px = bands[i].top * ratio;
      assert.ok(Math.abs(px - Math.round(px)) < 1e-6);
    }
  }
  const ten = bandsFor(BAND_DP * 10, 1);
  assert.deepEqual([...bandsNear(ten, 1000, 700)].sort((a, b) => a - b), [2, 3, 4, 5, 6]);
  assert.equal(bandsNear(ten, null, null).size, 10);
  assert.ok(sameSet(new Set([1, 2]), new Set([2, 1])) && !sameSet(new Set([1]), new Set([1, 2])));
  const dashes = dashesAlong(trackOf(points, "s"), { period: 14, on: 2, bands: bandsFor(layout.total, 2.625) });
  assert.ok(dashes.every((d) => Number.isInteger(d.band)));
});
