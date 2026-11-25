import test from "node:test";
import assert from "node:assert/strict";
import { bestStreak, blankText, formatFor } from "../components/session/sessionModel.js";

const choice = (key, extra = {}) => ({
  key,
  kind: "choice",
  prompt: "She ____ to school.",
  sentence: null,
  options: ["go", "goes", "going", "gone"],
  correctIndex: 1,
  ...extra,
});

test("blankText prefers the sentence, falls back to the prompt", () => {
  assert.equal(blankText(choice("a", { sentence: "I ___ here." })), "I ___ here.");
  assert.equal(blankText(choice("a")), "She ____ to school.");
  assert.equal(blankText(choice("a", { prompt: "Pick one" })), null);
});

test("only choice questions with a blank can be dragged", () => {
  assert.equal(formatFor(choice("x", { kind: "truefalse" })), "tiles");
  assert.equal(formatFor(choice("x", { kind: "fill" })), "tiles");
  assert.equal(formatFor(choice("x", { prompt: "Which is right?" })), "tiles");
  assert.equal(formatFor(choice("x", { correctIndex: null })), "tiles");
  assert.equal(formatFor(choice("x", { options: ["a very long option that wraps", "b"] })), "tiles");
  assert.equal(formatFor(choice("x", { options: ["a"] })), "tiles");
});

test("blank questions alternate between drag and tiles, stable per key", () => {
  const keys = Array.from({ length: 40 }, (_, i) => `quiz-${i}`);
  const formats = keys.map((k) => formatFor(choice(k)));
  assert.ok(formats.includes("drag"));
  assert.ok(formats.includes("tiles"));
  keys.forEach((k, i) => assert.equal(formatFor(choice(k)), formats[i]));
});

test("bestStreak counts the longest run of right answers", () => {
  const qs = ["a", "b", "c", "d", "e"].map((k) => choice(k));
  const fill = { key: "f", kind: "fill", options: [], correctIndex: null };
  assert.equal(bestStreak(qs, {}), 0);
  assert.equal(bestStreak(qs, { a: 1, b: 1, c: 0, d: 1 }), 2);
  assert.equal(bestStreak([...qs.slice(0, 2), fill, qs[2]], { a: 1, b: 1, f: "x", c: 1 }), 3);
});
