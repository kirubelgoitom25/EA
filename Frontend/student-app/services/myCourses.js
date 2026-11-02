import AsyncStorage from "@react-native-async-storage/async-storage";

// Which of the class's courses a student has added to "Your courses".
// The backend has no enrollment, so this is saved on the phone, per
// student. The first time, courses the student already has progress in are
// added automatically, so nothing they've worked on disappears.

const keyFor = (userId) => `ea.myCourses.v1.${userId}`;

export async function loadMyCourseIds(userId, courses) {
  try {
    const saved = await AsyncStorage.getItem(keyFor(userId));
    if (saved) {
      const ids = JSON.parse(saved);
      if (Array.isArray(ids)) return ids;
    }
  } catch (error) {
    // Storage unreadable: fall through to the default below.
  }

  const started = courses.filter((course) => (course.progress ?? 0) > 0).map((c) => c.id);
  await saveMyCourseIds(userId, started);
  return started;
}

export async function saveMyCourseIds(userId, ids) {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(ids));
  } catch (error) {
    // Not fatal: the choice still applies until the app restarts.
  }
}
