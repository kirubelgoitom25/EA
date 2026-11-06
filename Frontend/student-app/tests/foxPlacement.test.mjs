import test from "node:test";
import assert from "node:assert/strict";
import {
  EDGE_FOX,
  TITLE_FOX,
  cutLeft,
  figureRects,
  headQuads,
  intersects,
  placeEdgeFox,
  placeTitleFox,
  polyHitsRect,
  scaleOf,
} from "../components/ui/foxPlacement.js";

const r = (x, y, w, h) => ({ x, y, w, h });

// The design's screen (390 wide): chapter 3 is current, on the left, under the "Around Town" dome.
const design = {
  kicker: r(166, 538, 80, 16),
  title: r(166, 558, 215, 25),
  button: r(166, 592, 130, 40),
  others: [
    r(54, 194, 84, 90), // chapter 1
    r(152, 226, 70, 20), // its label
    r(242, 314, 84, 90), // chapter 2
    r(120, 346, 108, 20), // its label
    r(167, 450, 46, 38), // the dome
    r(224, 461, 95, 20), // "Around Town"
    r(42, 527, 108, 108), // chapter 3's ring
    r(242, 667, 84, 90), // chapter 4
  ],
};

const coversAny = (box, rects, k = 1) =>
  figureRects(box.x, box.y, box.w, box.h, k).some((s) => rects.some((o) => intersects(s, o)));

test("on the title: in the design she stands on the title, at its right end", () => {
  const spot = placeTitleFox({
    title: { lines: [design.title] },
    kicker: design.kicker,
    obstacles: [design.button, ...design.others],
    bounds: { left: 0, right: 390 },
  });
  assert.ok(spot);
  assert.equal(spot.y + spot.h, design.title.y, "her feet are on the title");
  assert.ok(Math.abs(spot.x + spot.w - (design.title.x + design.title.w)) <= 8, "lined up with its end");
  assert.ok(spot.x >= 0 && spot.x + spot.w <= 390);
  assert.ok(!coversAny(spot, [design.kicker, design.button, ...design.others]));
});

test("on the title: a short title slides her clear of the kicker above it", () => {
  const short = r(166, 558, 50, 25);
  const spot = placeTitleFox({
    title: { lines: [short] },
    kicker: design.kicker,
    obstacles: [design.button, ...design.others],
    bounds: { left: 0, right: 390 },
  });
  assert.ok(spot);
  assert.ok(!coversAny(spot, [design.kicker, short, design.button, ...design.others]));
});

test("on the title: right-aligned words (current step on the right) still find a clear spot", () => {
  const kicker = r(130, 538, 80, 16);
  const title = r(40, 558, 170, 25);
  const others = [r(54, 400, 84, 90), r(272, 527, 108, 108), r(54, 667, 84, 90)];
  const spot = placeTitleFox({ title: { lines: [title] }, kicker, obstacles: others, bounds: { left: 0, right: 390 } });
  assert.ok(spot);
  assert.ok(!coversAny(spot, [kicker, title, ...others]));
  assert.ok(spot.x >= 0 && spot.x + spot.w <= 390);
});

test("on the title: with nowhere clear she is not placed at all", () => {
  const wall = r(0, 0, 390, 557);
  const spot = placeTitleFox({ title: { lines: [design.title] }, kicker: design.kicker, obstacles: [wall], bounds: { left: 0, right: 390 } });
  assert.equal(spot, null);
});

test("on the title: sizes scale with the screen", () => {
  const k = scaleOf(430);
  const spot = placeTitleFox({ title: { lines: [design.title] }, obstacles: [], bounds: { left: 0, right: 430 }, k });
  assert.ok(Math.abs(spot.w - TITLE_FOX.w * k) < 1e-9 && Math.abs(spot.h - TITLE_FOX.h * k) < 1e-9);
});

const headClear = (spot, rects) => headQuads(spot.x, spot.y, spot.w, spot.h).every((q) => rects.every((o) => !polyHitsRect(q, o)));

test("edge peek: the flat cut at the bottom of the head is always past the screen's edge", () => {
  const spot = placeEdgeFox({ tile: { x: 96, y: 578 }, edge: 390, width: 390, obstacles: [design.button, ...design.others] });
  assert.ok(spot);
  assert.ok(cutLeft(spot.x, spot.y, spot.w, spot.h) >= 390);
  // as close to the design's spot as that allows
  assert.ok(spot.x - (390 - EDGE_FOX.fromRight) < 20);
  assert.ok(headClear(spot, [design.button, ...design.others]));
});

test("edge peek: a long title runs under where she would be, so she moves clear of it", () => {
  const title = r(166, 558, 214, 50); // two lines, right up to the edge
  const rects = [title, design.kicker, design.button, ...design.others];
  const spot = placeEdgeFox({ tile: { x: 96, y: 578 }, edge: 390, width: 390, obstacles: rects });
  assert.ok(spot);
  assert.ok(headClear(spot, rects));
  assert.ok(cutLeft(spot.x, spot.y, spot.w, spot.h) >= 390);
});

test("edge peek: with the current step on the right she leans in from the left, mirrored", () => {
  const button = r(80, 592, 130, 40);
  const title = r(40, 558, 170, 25);
  const rects = [button, title, r(272, 527, 108, 108)];
  const spot = placeEdgeFox({ tile: { x: 284, y: 578 }, edge: 390, width: 390, obstacles: rects, mirrored: true });
  assert.ok(spot && spot.mirrored);
  assert.ok(spot.x < 0, "she hangs off the left edge");
  // mirror back and check the cut and the clearances there
  const flip = { ...spot, x: 390 - (spot.x + spot.w) };
  const flipped = rects.map((o) => ({ ...o, x: 390 - (o.x + o.w) }));
  assert.ok(cutLeft(flip.x, flip.y, flip.w, flip.h) >= 390);
  assert.ok(headClear(flip, flipped));
});
