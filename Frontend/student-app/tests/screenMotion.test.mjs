import { test } from "node:test";
import assert from "node:assert/strict";

import { SCREEN } from "../components/ui/pathMotionModel.js";
import { chapterPath } from "../components/chapterPathModel.js";

test("the two screen moves take about 1-1.5 s together, steps 170-520 ms", () => {
  assert.ok(SCREEN.exit.end + SCREEN.enter.end >= 1000 && SCREEN.exit.end + SCREEN.enter.end <= 1500);
  for (const part of [SCREEN.exit, SCREEN.enter]) {
    for (const [name, value] of Object.entries(part)) {
      if (!Array.isArray(value)) continue;
      const [a, b] = value;
      if (name === "settle") {
        // the tile settles while the chapter page builds: it starts as the page switches
        assert.equal(a, part.end);
        assert.ok(b - a <= 400);
        continue;
      }
      assert.ok(b - a >= 170 && b - a <= 520, `${name} lasts ${b - a}`);
      assert.ok(b <= part.end, `${name} ends in time`);
    }
  }
  assert.ok(SCREEN.back.out + SCREEN.back.in <= 800);
});

test("the tile travels after the others start fading, and the fox comes last on the chapter page", () => {
  assert.ok(SCREEN.exit.tile[0] > SCREEN.exit.others[0]);
  assert.ok(SCREEN.enter.fox[0] > SCREEN.enter.others[0]);
  assert.ok(SCREEN.enter.den[0] > SCREEN.enter.line[0]);
});

const lesson = { id: "L1", completed: false };
const activity = (id, type, completed) => ({ type, activity: { id, title: `${type} ${id}`, completed } });

test("the chapter's path: the first step not done is the current one", () => {
  const state = { phase: "ready", questions: [], steps: [activity("a", "video", true), activity("b", "reading", false)], answers: {} };
  const path = chapterPath(state, lesson);
  assert.equal(path.nextAt, 1);
  assert.deepEqual(path.routeItems.map((item) => item.status), ["done", "next"]);
  assert.equal(path.routeItems[1].type, "reading");
  assert.equal(path.den.reached, false);
});

test("a finished chapter has no current step and its den is reached", () => {
  const state = { phase: "ready", questions: [], steps: [activity("a", "video", true)], answers: {} };
  const path = chapterPath(state, { id: "L1", completed: true });
  assert.equal(path.nextAt, -1);
  assert.equal(path.den.reached, true);
});
