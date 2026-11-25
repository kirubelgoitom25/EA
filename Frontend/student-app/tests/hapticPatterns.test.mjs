import test from "node:test";
import assert from "node:assert/strict";
import { MIN_GAP, MOMENTS, STAT_RAMP } from "../services/hapticPatterns.js";

const KINDS = { impact: ["light", "medium", "heavy", "soft", "rigid"], notify: ["success", "warning", "error"] };
const SYSTEM = ["confirm", "reject", "gesture-start", "gesture-end", "toggle-on", "toggle-off", "clock-tick", "context-click", "drag-start", "long-press", "segment-tick"];

test("every moment has a unique id and three variants a, b, c", () => {
  assert.equal(new Set(MOMENTS.map((m) => m.id)).size, MOMENTS.length);
  for (const moment of MOMENTS) assert.deepEqual(moment.variants.map((v) => v.id), ["a", "b", "c"], moment.id);
});

test("every step uses a known kind and value", () => {
  for (const moment of MOMENTS)
    for (const variant of moment.variants)
      for (const step of variant.steps) {
        const allowed = step.kind === "system" ? SYSTEM : KINDS[step.kind];
        assert.ok(allowed?.includes(step.value), `${moment.id}/${variant.id}: ${step.kind} ${step.value}`);
      }
});

test("steps run in order and are spaced so one never cancels the one before", () => {
  for (const moment of MOMENTS)
    for (const variant of moment.variants)
      variant.steps.forEach((step, index) => {
        if (index === 0) return;
        const gap = step.at - variant.steps[index - 1].at;
        assert.ok(gap >= MIN_GAP, `${moment.id}/${variant.id}: step ${index} is only ${gap} ms after the last`);
      });
});

test("the stat ramp has three beats, each stronger than the last", () => {
  const strength = { soft: 30, medium: 50, heavy: 70 };
  assert.equal(STAT_RAMP.length, 3);
  STAT_RAMP.forEach((style, index) => {
    assert.ok(style in strength, style);
    if (index > 0) assert.ok(strength[style] > strength[STAT_RAMP[index - 1]], `${style} is not stronger than ${STAT_RAMP[index - 1]}`);
  });
});
