import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { ADVANCE, advanceOf, forgetPathMotion } from "../components/ui/pathMotionModel.js";

beforeEach(forgetPathMotion);

const path = (...statuses) => statuses.map((status, i) => ({ id: `s${i}`, status }));

test("a first showing never plays", () => {
  assert.equal(advanceOf(path("done", "next", "todo"), "c1", false), null);
});

test("finishing the current step: it is done, the next unlocks, the line moves on", () => {
  advanceOf(path("done", "next", "todo"), "c1", false);
  const advance = advanceOf(path("done", "done", "next"), "c1", false);
  assert.deepEqual(advance.done, [1]);
  assert.deepEqual(advance.unlock, [2]);
  assert.equal(advance.leaving, 1);
  assert.equal(advance.denLit, false);
  assert.equal(advance.lastFrom, 1);
  assert.equal(advance.lastTo, 2);
});

test("it plays once: the same state again is not an advance", () => {
  advanceOf(path("next", "todo"), "c1", false);
  assert.ok(advanceOf(path("done", "next"), "c1", false));
  assert.equal(advanceOf(path("done", "next"), "c1", false), null);
});

test("the last step done lights the den", () => {
  advanceOf(path("done", "next"), "c1", false);
  const advance = advanceOf(path("done", "done"), "c1", true);
  assert.equal(advance.denLit, true);
  assert.deepEqual(advance.unlock, []);
  assert.equal(advance.lastFrom, 1);
  assert.equal(advance.lastTo, 2); // the line reaches the den
});

test("several steps done while away all turn at once", () => {
  advanceOf(path("next", "todo", "todo", "todo"), "c1", false);
  const advance = advanceOf(path("done", "done", "next", "todo"), "c1", false);
  assert.deepEqual(advance.done, [0, 1]);
  assert.deepEqual(advance.unlock, [2]);
  assert.equal(advance.leaving, 0);
});

test("practising again (going back) is not an advance", () => {
  advanceOf(path("done", "done"), "c1", true);
  assert.equal(advanceOf(path("next", "todo"), "c1", false), null);
});

test("steps are known by id, so another path with the same steps shares what was shown", () => {
  advanceOf(path("done", "next", "todo"), "home", false);
  const advance = advanceOf(path("done", "done", "next"), "course", false);
  assert.deepEqual(advance.done, [1]);
});

test("each piece is 160-480 ms, in order, and the whole is about 1.5 s", () => {
  const windows = ["iconOut", "checkIn", "face", "ringOut", "wordsOut", "labelIn", "line", "unlock", "pop", "ringIn", "foxDuck", "foxPeek", "wordsIn"];
  windows.forEach((name) => {
    const [a, b] = ADVANCE[name];
    assert.ok(b - a >= 140 && b - a <= 480, `${name} lasts ${b - a}`);
    assert.ok(b <= ADVANCE.end, `${name} ends by the end`);
  });
  assert.ok(ADVANCE.end >= 1000 && ADVANCE.end <= 1550);
  assert.ok(ADVANCE.checkIn[0] >= ADVANCE.iconOut[1]);
  assert.ok(ADVANCE.line[0] >= ADVANCE.ringOut[1]);
  assert.ok(ADVANCE.unlock[0] >= ADVANCE.line[0]);
  assert.ok(ADVANCE.foxPeek[0] > ADVANCE.foxDuck[1]);
  assert.ok(ADVANCE.wordsIn[0] >= ADVANCE.ringIn[1]);
});
