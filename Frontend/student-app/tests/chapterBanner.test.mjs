import test from "node:test";
import assert from "node:assert/strict";
import { TILE, bannerIndex, openScroll } from "../components/ui/chapterBannerModel.js";
import { layoutPath } from "../components/ui/pathModel.js";

// Home's usual trail: two chapters done, the current one, two ahead (cta off, fox above, zigzag).
const items = ["done", "done", "next", "todo", "todo"].map((status) => ({ status }));
const { centers } = layoutPath(items, false, true, true);
const GAP = 4;
const FOX_TOP = -140; // ringTop(84) + tuck - head height on the real path: -57 + 12 - 95
const ROOM = 18;

test("at the top of the trail the banner names the first chapter", () => {
  assert.equal(bannerIndex(centers, 0, GAP), 0);
});

test("Home opens with the current chapter in the banner, its fox in full under it", () => {
  const y = openScroll(centers, 2, GAP, FOX_TOP, ROOM);
  assert.equal(bannerIndex(centers, y, GAP), 2);
  assert.equal(GAP + centers[2] + FOX_TOP - y, ROOM, "the fox's head starts 18 dp under the banner");
  // the chapter before it is tucked partly behind the banner, so it doesn't count
  assert.ok(GAP + centers[1] - TILE / 2 - y < 0);
});

test("scrolling moves the banner one chapter at a time, both ways", () => {
  const seen = [];
  for (let y = 0; y <= 700; y += 5) {
    const i = bannerIndex(centers, y, GAP);
    if (seen[seen.length - 1] !== i) seen.push(i);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4]);
});

test("scrolled past every tile, the last chapter stays", () => {
  assert.equal(bannerIndex(centers, 5000, GAP), 4);
  assert.equal(bannerIndex([], 0, GAP), -1);
});

test("a current chapter near the top opens at the top, never above it", () => {
  const first = layoutPath(["next", "todo"].map((status) => ({ status })), false, true, true).centers;
  assert.equal(openScroll(first, 0, GAP, FOX_TOP, ROOM), 0);
  assert.equal(openScroll(first, 7, GAP, FOX_TOP, ROOM), 0);
});
