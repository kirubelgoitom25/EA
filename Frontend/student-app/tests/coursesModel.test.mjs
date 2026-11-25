import { test } from "node:test";
import assert from "node:assert/strict";

import { courseProgress, groupCourses } from "../components/coursesModel.js";

const course = (id, done, total) => ({ id, completedLessons: done, totalLessons: total });

test("a course is started, done or new from its chapters", () => {
  assert.equal(courseProgress(course("a", 2, 4)).state, "started");
  assert.equal(courseProgress(course("a", 2, 4)).value, 0.5);
  assert.equal(courseProgress(course("a", 4, 4)).state, "done");
  assert.equal(courseProgress(course("a", 0, 4)).state, "new");
  assert.equal(courseProgress(course("a", 0, 0)).state, "new"); // no chapters yet
  assert.equal(courseProgress(course("a", 9, 4)).done, 4); // never more than all
  assert.equal(courseProgress({ id: "a" }).state, "new");
});

test("sections come in order and empty ones are left out", () => {
  const sections = groupCourses([course("n", 0, 3), course("d", 3, 3), course("s", 1, 3)]);
  assert.deepEqual(sections.map((s) => s.title), ["CONTINUE LEARNING", "COMPLETED", "NOT STARTED"]);
  assert.deepEqual(groupCourses([course("d", 3, 3)]).map((s) => s.key), ["done"]);
  assert.deepEqual(groupCourses([]), []);
});

test("started courses: most recently opened first, never opened after, in list order", () => {
  const list = [course("a", 1, 4), course("b", 1, 4), course("c", 1, 4), course("d", 1, 4)];
  const [started] = groupCourses(list, { c: 200, b: 300 });
  assert.deepEqual(started.courses.map((c) => c.id), ["b", "c", "a", "d"]);
});
