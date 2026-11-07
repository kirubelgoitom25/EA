import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { ARRIVAL, SPARK, SPARKS, arrivalPlan, burstDelay, firstOpen, foxFrames, forgetPathMotion, newlyDone, riseFrames } from "../components/ui/pathMotionModel.js";

const rising = (values) => values.every((v, i) => i === 0 || v >= values[i - 1]);
const stops = [100, 250, 400, 550, 700, 850, 1000, 1150, 1300];

beforeEach(forgetPathMotion);

test("chapters in view play about half a second apart, top to bottom", () => {
  const plan = arrivalPlan({ stops, top: 0, bottom: 720, total: 1400 });
  assert.deepEqual(Object.keys(plan.at).map(Number), [0, 1, 2, 3, 4]);
  const gaps = [1, 2, 3, 4].map((i) => plan.at[i] - plan.at[i - 1]);
  gaps.forEach((gap) => assert.ok(gap > 450 && gap <= 500, `gap ${gap}`));
});

test("chapters out of view are left out, above and below", () => {
  const plan = arrivalPlan({ stops, top: 520, bottom: 1020, total: 1400 });
  assert.deepEqual(Object.keys(plan.at).map(Number), [3, 4, 5, 6]);
  assert.equal(plan.line.outputRange[0], 544); // the line above is already drawn, but not the first dot
});

test("the sequence stays under 3 seconds however much is in view", () => {
  for (const count of [0, 1, 2, 5, 9, 40]) {
    const many = Array.from({ length: count }, (_, i) => i * 10);
    for (const lead of [ARRIVAL.lead, ARRIVAL.scrollLead]) {
      const plan = arrivalPlan({ stops: many, top: 0, bottom: 9999, total: 500, lead });
      assert.ok(plan.end <= 3000, `${count} stops end at ${plan.end}`);
      assert.ok(plan.end + 0 <= ARRIVAL.routineWait);
    }
  }
});

test("the fox comes after the last chapter has started", () => {
  const plan = arrivalPlan({ stops, top: 0, bottom: 720, total: 1400 });
  assert.ok(plan.fox > Math.max(...Object.values(plan.at)));
});

test("the line only ever draws forward, and ends fully drawn", () => {
  for (const bottom of [0, 300, 720, 2000]) {
    const { inputRange, outputRange } = arrivalPlan({ stops, top: 0, bottom, total: 1400 }).line;
    assert.ok(inputRange.every((v, i) => i === 0 || v > inputRange[i - 1]), `times ${inputRange}`);
    assert.ok(rising(outputRange), `heights ${outputRange}`);
    assert.equal(outputRange[outputRange.length - 1], 1400);
  }
});

test("a chapter rises 16, fades in, grows 90% to 104% and settles at 100% in about 0.4 s", () => {
  const { inputRange, opacity, y, scale } = riseFrames(1000);
  assert.equal(inputRange[0], 1000);
  assert.equal(inputRange[inputRange.length - 1], 1400);
  assert.ok(rising(inputRange));
  assert.equal(opacity[0], 0);
  assert.equal(opacity[opacity.length - 1], 1);
  assert.equal(y[0], 16);
  assert.equal(y[y.length - 1], 0);
  assert.equal(scale[0], 0.9);
  assert.equal(Math.max(...scale), 1.04);
  assert.equal(scale[scale.length - 1], 1);
});

test("the fox starts off to the right and ends in place", () => {
  const { inputRange, x } = foxFrames(2000);
  assert.ok(rising(inputRange));
  assert.equal(x[0], 90);
  assert.equal(x[x.length - 1], 0);
});

test("the sparkle is three 14 dp stars and three 8 dp dots, flying 50 to 60 dp", () => {
  assert.equal(SPARKS.length, 6);
  assert.equal(SPARKS.filter((s) => s.shape === "star").length, 3);
  assert.equal(SPARKS.filter((s) => s.shape === "dot").length, 3);
  assert.equal(SPARK.star, 14);
  assert.equal(SPARK.dot, 8);
  assert.equal(SPARK.fly, 500);
  assert.equal(SPARK.life, 800);
  SPARKS.forEach(({ dx, dy }) => {
    const far = Math.hypot(dx, dy);
    assert.ok(far >= 50 && far <= 60, `${dx},${dy} goes ${far}`);
  });
  assert.equal(new Set(SPARKS.map((s) => Math.round(Math.atan2(s.dy, s.dx) * 10))).size, 6);
});

test("a course opens for the first time once per session", () => {
  assert.equal(firstOpen("a"), true);
  assert.equal(firstOpen("a"), false);
  assert.equal(firstOpen("b"), true);
  forgetPathMotion();
  assert.equal(firstOpen("a"), true);
});

test("a step bursts when it goes from not done to done", () => {
  assert.deepEqual(newlyDone([{ id: "a", status: "done" }, { id: "b", status: "next" }]), []);
  assert.deepEqual(newlyDone([{ id: "a", status: "done" }, { id: "b", status: "done" }]), [1]);
});

test("one completion bursts once, even on a second path showing the same step", () => {
  newlyDone([{ id: "a", status: "next" }]);
  assert.deepEqual(newlyDone([{ id: "a", status: "done" }]), [0]);
  assert.deepEqual(newlyDone([{ id: "a", status: "done" }]), []);
});

test("a step already done when first seen never bursts, nor does one that flickers back", () => {
  assert.deepEqual(newlyDone([{ id: "a", status: "done" }]), []);
  newlyDone([{ id: "a", status: "todo" }]);
  assert.deepEqual(newlyDone([{ id: "a", status: "done" }]), []);
});

test("a burst waits only for what is left of its step's arrival", () => {
  const plan = { at: { 1: 750 }, startedAt: 10000 };
  assert.equal(burstDelay(plan, 1, 10000), 1150); // on arrival: once the tile has settled
  assert.equal(burstDelay(plan, 1, 10900), 250);
  assert.equal(burstDelay(plan, 1, 90000), 0); // long after the arrival: with the check, at once
  assert.equal(burstDelay(plan, 2, 10000), 0); // a chapter that did not play
  assert.equal(burstDelay(null, 1, 10000), 0); // no arrival at all
});

test("steps without an id are ignored", () => {
  newlyDone([{ status: "todo" }]);
  assert.deepEqual(newlyDone([{ status: "done" }]), []);
});
