import AsyncStorage from "@react-native-async-storage/async-storage";

// When the student last opened each course, so the Courses tab can list the course they were last in
// first. The backend doesn't record this, so it is kept on the phone, per student:
// { [courseId]: milliseconds }.

const keyFor = (userId) => `ea.courseOpens.v1.${userId}`;

export async function loadCourseOpens(userId) {
  try {
    const saved = await AsyncStorage.getItem(keyFor(userId));
    const opens = saved ? JSON.parse(saved) : null;
    return opens && typeof opens === "object" ? opens : {};
  } catch (error) {
    return {}; // unreadable: the list keeps its usual order
  }
}

// The opens with this course stamped now (saved in the background).
export function stampCourseOpen(userId, opens, courseId) {
  const next = { ...opens, [courseId]: Date.now() };
  AsyncStorage.setItem(keyFor(userId), JSON.stringify(next)).catch(() => {});
  return next;
}
