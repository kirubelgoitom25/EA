import test from "node:test";
import assert from "node:assert/strict";
import { SWAY, bezierPoint, layoutPath, pathD, pathPoints, pointAt, segment, travelled, wordsSide, xOf } from "../components/ui/pathModel.js";

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
