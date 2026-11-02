// The course journey, pure parts (no storage, easy to test): when the introduction and finale
// apply, and the fox's short guide lines.

// The introduction is for a course the student has not begun: no chapter done yet.
export const isFreshCourse = (course) => (course?.completedLessons ?? 0) === 0;

export const isCourseComplete = (course) => {
  const total = course?.totalLessons ?? 0;
  return total > 0 && (course?.completedLessons ?? 0) >= total;
};

// A short cheer after finishing a video or reading.
export function cheerFor(kind) {
  return kind === "video" ? "Great watching!" : "Nicely read!";
}

export const chapterWord = (count) => (count === 1 ? "chapter" : "chapters");
