import test from "node:test";
import assert from "node:assert/strict";
import { PATH_ART } from "../components/ui/sceneryArt.js";

// The path background repeats straight down every PATH_ART.height (path fixes, section 5): no seam, no
// tree cut by the tile's edge.
const H = PATH_ART.height;
const ellipses = [...PATH_ART.xml.matchAll(/<ellipse cx="([\d.]+)" cy="(-?[\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="(#\w+)"/g)].map((m) => ({
  cx: +m[1],
  cy: +m[2],
  rx: +m[3],
  ry: +m[4],
  fill: m[5],
}));

test("a hill that runs past the tile's bottom is drawn again 700 higher, under everything else", () => {
  assert.ok(ellipses.length >= 4);
  const crossing = ellipses.filter((e) => e.cy + e.ry > H);
  assert.ok(crossing.length >= 1);
  crossing.forEach((e) => {
    const twin = ellipses.findIndex((o) => o.cx === e.cx && o.cy === e.cy - H && o.rx === e.rx && o.ry === e.ry && o.fill === e.fill);
    assert.ok(twin >= 0, "its twin at the top");
    // nothing drawn before the twin reaches the top edge's band where it shows
    ellipses.slice(0, twin).forEach((o) => assert.ok(o.cy - o.ry > 0 || o === e));
  });
  // and one that runs past the top is the twin of one at the bottom
  ellipses.filter((e) => e.cy - e.ry < 0).forEach((e) => assert.ok(ellipses.some((o) => o.cy === e.cy + H && o.cx === e.cx)));
});

test("at the seam the near hill covers the whole width, so both sides of the edge match", () => {
  const bottom = ellipses.filter((e) => e.cy + e.ry > H);
  for (let x = 0; x <= PATH_ART.width; x += 5) {
    assert.ok(bottom.some((e) => ((x - e.cx) / e.rx) ** 2 + ((H - e.cy) / e.ry) ** 2 < 1), `x ${x}`);
  }
});

test("no tree crosses the tile's top or bottom edge", () => {
  const ys = [];
  for (const m of PATH_ART.xml.matchAll(/<path d="M([\d.]+) ([\d.]+)l[\d.]+ ([\d.]+)/g)) ys.push(+m[2], +m[2] + +m[3]);
  for (const m of PATH_ART.xml.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)) ys.push(+m[1], +m[1] + +m[2]);
  assert.ok(ys.length > 10);
  ys.forEach((y) => assert.ok(y > 0 && y < H, `y ${y}`));
});

test("the join colour is the near hill's, the one that covers both edges", async () => {
  const { PATH_ART_SEAM } = await import("../components/ui/sceneryArt.js");
  const bottom = ellipses.filter((e) => e.cy + e.ry > H);
  assert.ok(bottom.every((e) => e.fill === PATH_ART_SEAM));
});
