import test from "node:test";
import assert from "node:assert/strict";
import { ROAD, SWAY, bezierPoint, roadBox, roadDots, zigX, layoutPath, pathD, pathLength, pathPoints, pointAt, segment, travelled, wordsSide, xOf } from "../components/ui/pathModel.js";

const item = (status, extra = {}) => ({ status, ...extra });
const items = (...statuses) => statuses.map((status) => item(status));

test("steps swing across the width but stay on the screen", () => {
  const xs = Array.from({ length: 24 }, (_, i) => xOf(i, 300));
  assert.ok(Math.min(...xs) < 80 && Math.max(...xs) > 220, "it uses both sides of a 300 wide path");
  assert.ok(Math.min(...xs) >= 300 * (0.5 - SWAY) - 1e-9 && Math.max(...xs) <= 300 * (0.5 + SWAY) + 1e-9);
});

test("the line weaves in long waves, not a zigzag: it keeps one direction for several steps", () => {
  const dir = (i) => Math.sign(xOf(i + 1, 300) - xOf(i, 300));
  let longest = 0;
  let run = 1;
  for (let i = 1; i < 30; i += 1) {
    run = dir(i) === dir(i - 1) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  assert.ok(longest >= 3, "at least three steps in a row lean the same way");
  // and never a jump from one edge to the other between two steps
  for (let i = 0; i < 30; i += 1) assert.ok(Math.abs(xOf(i + 1, 300) - xOf(i, 300)) < 300 * 0.3);
});

test("a step's words go on the side with more room", () => {
  for (let i = 0; i < 20; i += 1) {
    const x = xOf(i, 300);
    if (wordsSide(i) === "right") assert.ok(x <= 150);
    else assert.ok(x >= 150 - 1e-9);
  }
});

test("the path is as tall as its rows, with room for a part's dome and the bubble", () => {
  const plain = layoutPath(items("done", "todo"), true);
  const withPart = layoutPath([item("done"), item("todo", { eyebrow: "Part two" })], true);
  assert.ok(withPart.total > plain.total);
  assert.ok(layoutPath(items("next"), true).total > layoutPath(items("next"), false).total);
  const { offsets, centers, den, total } = layoutPath([item("done"), item("next"), item("todo")], true);
  assert.equal(offsets[0], 0);
  assert.ok(centers[0] < offsets[1] && centers[1] < offsets[2]);
  assert.equal(total, den.top + 148);
});

test("the curve passes through every step and flows through it without a kink", () => {
  const { points } = pathPoints(items("done", "done", "next", "todo", "todo"), true, 300);
  for (let i = 0; i < points.length; i += 1) assert.deepEqual(pointAt(points, i), points[i]);
  // the direction leaving a step is the direction arriving at it
  for (let i = 1; i < points.length - 1; i += 1) {
    const [, , inHandle, end] = segment(points, i - 1);
    const [start, outHandle] = segment(points, i);
    const arriving = { x: end.x - inHandle.x, y: end.y - inHandle.y };
    const leaving = { x: outHandle.x - start.x, y: outHandle.y - start.y };
    const cross = arriving.x * leaving.y - arriving.y * leaving.x;
    assert.ok(Math.abs(cross) < 1e-6, "same direction through the point");
  }
  assert.deepEqual(pointAt(points, 99), points[points.length - 1]);
});

test("the path always runs downward, never doubling back", () => {
  const { points } = pathPoints(items("done", "done", "next", "todo", "todo", "todo"), true, 300);
  let lastY = -Infinity;
  for (let k = 0; k <= points.length - 1; k += 0.05) {
    const { y } = pointAt(points, k);
    assert.ok(y >= lastY - 1e-9);
    lastY = y;
  }
});

test("bezierPoint runs from the start to the end of a piece", () => {
  const piece = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 40 }, { x: 30, y: 40 }];
  assert.deepEqual(bezierPoint(piece, 0), piece[0]);
  assert.deepEqual(bezierPoint(piece, 1), piece[3]);
});

test("the path is one piece, so the dots keep their rhythm", () => {
  const { points } = pathPoints(items("done", "next", "todo"), false, 300);
  assert.equal((pathD(points).match(/M/g) ?? []).length, 1);
  assert.equal((pathD(points).match(/C/g) ?? []).length, 2);
  assert.equal(pathD(points, 0, 0), "");
  assert.ok(pathD(points).startsWith(pathD(points, 0, 1)));
});

test("the travelled path ends where you stand", () => {
  const den = { reached: false };
  assert.equal(travelled(items("todo", "todo"), den), -1);
  assert.equal(travelled(items("done", "next", "todo"), den), 1);
  assert.equal(travelled(items("done", "done", "done"), den), 2);
  assert.equal(travelled(items("done", "done"), { reached: true }), 2);
  assert.equal(travelled(items("done", "next", "done"), den), 1);
});

test("the trail zig-zags through 96, 270, 150, 280 and again on a 390 screen (path fixes, section 2)", () => {
  const steps = [1, 2, 3, 4, 5, 6].map((number, i) => item(i < 2 ? "done" : i === 2 ? "next" : "todo", { number }));
  // a 342 wide path centred on a 390 wide screen (24 dp gutters)
  const { points } = pathPoints(steps, false, 342, false, true, { frame: 390 });
  assert.deepEqual(points.map((p) => Math.round(p.x + 24)), [96, 270, 150, 280, 96, 270]);
  // scaled on a wider screen
  const wide = pathPoints(steps, false, 732, false, true, { frame: 780 });
  assert.deepEqual(wide.points.slice(0, 2).map((p) => Math.round(p.x + 24)), [192, 540]);
});

test("the course trail matches the reference: tiles at y 74, 174, 306, 434, 544", () => {
  const steps = ["done", "done", "next", "todo", "todo"].map((status, i) => item(status, { number: i + 14 }));
  const { centers } = layoutPath(steps, false, false, "course");
  assert.deepEqual(centers.map(Math.round), [74, 179, 311, 439, 544]);
  // within 5 dp of the reference's tile centres
  [74, 174, 306, 434, 544].forEach((ref, i) => assert.ok(Math.abs(centers[i] - ref) <= 5));
});

test("the chapter trail matches the reference: tiles at y 88, 208, 350, 488, den under them", () => {
  const steps = ["done", "done", "next", "todo"].map((status) => item(status));
  const { centers, den } = layoutPath(steps, false, false, "chapter");
  [88, 208, 350, 488].forEach((ref, i) => assert.ok(Math.abs(centers[i] - ref) <= 5));
  assert.equal(Math.round(den.top), 604);
});

test("the trail's rows scale with the screen's width, like the artwork behind them", () => {
  const steps = ["done", "next", "todo"].map((status) => item(status));
  const narrow = layoutPath(steps, false, false, "chapter", 390).centers;
  const wide = layoutPath(steps, false, false, "chapter", 780).centers;
  wide.forEach((c, i) => assert.equal(Math.round(c), Math.round(narrow[i] * 2)));
});

test("the zigzag line leaves and enters every chapter straight down, with no kink", () => {
  const steps = [1, 2, 3, 4].map((number) => item("todo", { number }));
  const { points } = pathPoints(steps, true, 342, false, false, { frame: 390 });
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, b, c, d] = segment(points, i, "s");
    assert.equal(b.x, a.x);
    assert.equal(c.x, d.x);
    assert.ok(b.y > a.y && c.y < d.y);
  }
  assert.ok(pathD(points, 0, points.length - 1, "s").startsWith("M"));
});

test("the zigzag keeps no room over the current step for a bubble: it sits beside the step", () => {
  const steps = [item("done", { number: 1 }), item("next", { number: 2 })];
  assert.deepEqual(layoutPath(steps, true, true, true), layoutPath(steps, false, true, true));
});

test("pathLength: a straight drop is as long as the drop, and an S curve is longer than its chord", () => {
  const straight = [{ x: 50, y: 0 }, { x: 50, y: 120 }];
  assert.ok(Math.abs(pathLength(straight, 0, 1, "s") - 120) < 1e-6);
  const zig = [{ x: 96, y: 0 }, { x: 284, y: 125 }, { x: 96, y: 250 }];
  const one = pathLength(zig, 0, 1, "s");
  assert.ok(one > Math.hypot(188, 125) && one < 188 + 125);
  assert.ok(Math.abs(pathLength(zig, 0, 2, "s") - 2 * one) < 1e-6, "the two mirrored pieces are the same length");
  assert.equal(pathLength(zig, 1, 1, "s"), 0);
});

test("every step swings across from the one before it, by at least 120, wrap included", () => {
  for (let number = 1; number <= 40; number += 1) {
    const a = zigX(number, 390);
    const b = zigX(number + 1, 390);
    assert.ok(Math.abs(b - a) >= 120, `steps ${number} and ${number + 1}`);
    assert.notEqual(Math.sign(a - 195), Math.sign(b - 195), "the other side of the middle");
  }
  // chapter 15 to 16 (the visible case of the old five-spot bug)
  assert.ok(Math.abs(zigX(16, 390) - zigX(15, 390)) >= 120);
});

const gaps = (dots) => dots.slice(1).map((d, i) => Math.hypot(d.x - dots[i].x, d.y - dots[i].y));

test("the road is round dots evenly spaced along each stretch, by distance along the curve", () => {
  const points = [{ x: 96, y: 100 }, { x: 270, y: 206 }];
  const dots = roadDots(points);
  // the first dot ROAD.start in, then every ROAD.step along the curve: never more than that apart in a
  // straight line, and only a little less on the bend
  assert.ok(Math.abs(Math.hypot(dots[0].x - 96, dots[0].y - 100) - ROAD.start) < 0.1);
  gaps(dots).forEach((g) => assert.ok(g <= ROAD.step + 1e-6 && g > ROAD.step * 0.97, `gap ${g}`));
  // the curve is the "s" one, so every dot lies between the two steps and runs downward
  dots.forEach((d, i) => {
    assert.ok(d.x >= 96 - 1e-6 && d.x <= 270 + 1e-6);
    if (i) assert.ok(d.y >= dots[i - 1].y);
  });
  assert.ok(dots.every((d) => d.seg === 0));
});

test("no dot is drawn inside a tile's box (grown 3 all round and 9 below)", () => {
  const points = [{ x: 96, y: 100 }, { x: 270, y: 206 }, { x: 150, y: 312 }];
  const boxes = points.map(({ x, y }) => roadBox(x, y, 34, 37, 37));
  assert.deepEqual(boxes[0], { left: 59, right: 133, top: 60, bottom: 146 });
  const dots = roadDots(points, boxes);
  const within = (b, d) => d.x >= b.left && d.x <= b.right && d.y >= b.top && d.y <= b.bottom;
  dots.forEach((d) => boxes.forEach((b) => assert.ok(!within(b, d))));
  // both stretches still have their dots, each numbered by its stretch
  assert.ok(dots.some((d) => d.seg === 0) && dots.some((d) => d.seg === 1));
  // and the road between the tiles is unchanged: the same dots as with no boxes, minus the hidden ones
  const all = roadDots(points);
  assert.equal(all.filter((d) => !boxes.some((b) => within(b, d))).length, dots.length);
});

test("the road also keeps clear of extra boxes along a stretch (a part's dome)", () => {
  const points = [{ x: 96, y: 100 }, { x: 270, y: 300 }];
  const dome = roadBox(183, 200, 24, 19, 17);
  const dots = roadDots(points, [], [dome]);
  assert.ok(dots.length < roadDots(points).length);
  dots.forEach((d) => assert.ok(!(d.x >= dome.left && d.x <= dome.right && d.y >= dome.top && d.y <= dome.bottom)));
});
