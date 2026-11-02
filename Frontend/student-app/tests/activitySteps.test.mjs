import test from "node:test";
import assert from "node:assert/strict";
import { buildSteps, hasOwnSteps, splitAroundQuestions, youtubeId } from "../services/activitySteps.js";

const a = (id, kind, extra = {}) => ({ id, kind, title: kind, completed: false, ready: true, ...extra });

test("video and reading stay separate steps, in the teacher's order", () => {
  const steps = buildSteps([a(1, "video"), a(2, "reading"), a(3, "video")]);
  assert.deepEqual(steps.map((s) => [s.type, s.activity.id]), [["video", 1], ["reading", 2], ["video", 3]]);
});

test("quiz and practice fold into ONE questions step at the position of the first", () => {
  const steps = buildSteps([a(1, "video"), a(2, "quiz"), a(3, "reading"), a(4, "practice")]);
  assert.deepEqual(steps.map((s) => s.type), ["video", "questions", "reading"]);
  assert.deepEqual(steps[1].activities.map((x) => x.id), [2, 4]);
});

test("a quiz or practice with no questions yet is skipped", () => {
  assert.deepEqual(buildSteps([a(1, "quiz", { ready: false }), a(2, "practice", { ready: false })]), []);
  const steps = buildSteps([a(1, "quiz", { ready: false }), a(2, "practice")]);
  assert.deepEqual(steps[0].activities.map((x) => x.id), [2]);
});

test("nothing from the server gives no steps (older chapters work as before)", () => {
  assert.deepEqual(buildSteps(null), []);
  assert.deepEqual(buildSteps(undefined), []);
  assert.deepEqual(buildSteps([]), []);
  assert.equal(hasOwnSteps([]), false);
});

test("steps before and after the question trail", () => {
  const steps = buildSteps([a(1, "reading"), a(2, "quiz"), a(3, "video")]);
  const { before, hasQuestions, after } = splitAroundQuestions(steps);
  assert.equal(hasQuestions, true);
  assert.deepEqual(before.map((s) => s.activity.id), [1]);
  assert.deepEqual(after.map((s) => s.activity.id), [3]);
  const none = splitAroundQuestions(buildSteps([a(1, "video"), a(2, "reading")]));
  assert.equal(none.hasQuestions, false);
  assert.equal(none.before.length, 2);
  assert.equal(hasOwnSteps(steps), true);
  assert.equal(hasOwnSteps(buildSteps([a(1, "quiz")])), false);
});

test("YouTube ids, same links as the teacher site", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  for (const bad of ["", "nope", "http://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/1", "https://youtu.be/short", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", null]) {
    assert.equal(youtubeId(bad), null, String(bad));
  }
});

import { nextStepAfter } from "../services/activitySteps.js";
import { cheerFor, isCourseComplete, isFreshCourse } from "../services/journeyModel.js";

test("nextStepAfter offers the next step that is not done, in order", () => {
  const steps = buildSteps([a(1, "video"), a(2, "reading"), a(3, "quiz")]);
  assert.equal(nextStepAfter(steps, 1).activity.id, 2);
  assert.deepEqual(nextStepAfter(steps, 2), { type: "questions" });
  assert.equal(nextStepAfter(steps, 2, { questionsDone: true }), null);
});

test("nextStepAfter skips steps already completed and ends with null", () => {
  const steps = buildSteps([a(1, "video"), a(2, "reading", { completed: true }), a(3, "video")]);
  assert.equal(nextStepAfter(steps, 1).activity.id, 3);
  assert.equal(nextStepAfter(steps, 3), null);
  assert.equal(nextStepAfter(steps, 99), null);
});

test("a course is fresh until a chapter is done, and complete when all are", () => {
  assert.equal(isFreshCourse({ completedLessons: 0, totalLessons: 4 }), true);
  assert.equal(isFreshCourse({ completedLessons: 1, totalLessons: 4 }), false);
  assert.equal(isCourseComplete({ completedLessons: 4, totalLessons: 4 }), true);
  assert.equal(isCourseComplete({ completedLessons: 3, totalLessons: 4 }), false);
  assert.equal(isCourseComplete({ completedLessons: 0, totalLessons: 0 }), false);
});

test("the fox cheers differently for a video and a reading", () => {
  assert.notEqual(cheerFor("video"), cheerFor("reading"));
});
