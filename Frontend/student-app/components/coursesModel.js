// How the Courses tab groups the student's courses (plain functions, no React, so they're easy to test).

// Chapters done and in total, and the course's state: "started" (some done, not all), "done" (all
// done) or "new" (nothing done yet, or no chapters).
export function courseProgress(course) {
  const total = Math.max(Number(course?.totalLessons) || 0, 0);
  const done = Math.min(Math.max(Number(course?.completedLessons) || 0, 0), total);
  const state = total > 0 && done >= total ? "done" : done > 0 ? "started" : "new";
  return { total, done, value: total > 0 ? done / total : 0, state };
}

// The three sections, in the order shown: started courses (most recently opened first; never-opened
// ones keep the list's order, after the opened ones), then finished, then not started. Empty sections
// are left out. openedAt: { [courseId]: ms }.
export function groupCourses(courses = [], openedAt = {}) {
  const started = [];
  const done = [];
  const fresh = [];
  courses.forEach((course, index) => {
    const { state } = courseProgress(course);
    const item = { course, index };
    if (state === "started") started.push(item);
    else if (state === "done") done.push(item);
    else fresh.push(item);
  });
  const opened = (item) => Number(openedAt?.[item.course.id]) || 0;
  started.sort((a, b) => opened(b) - opened(a) || a.index - b.index);
  return [
    { key: "started", title: "CONTINUE LEARNING", courses: started.map((item) => item.course) },
    { key: "done", title: "COMPLETED", courses: done.map((item) => item.course) },
    { key: "new", title: "NOT STARTED", courses: fresh.map((item) => item.course) },
  ].filter((section) => section.courses.length > 0);
}
