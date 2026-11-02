// The course journey: one-time moments (the introduction when a course is first opened, the finale
// when its last chapter is done) and the fox's short guide lines. The "seen" flags are kept on the
// phone, per student, like "Your courses" (services/myCourses). Plain functions where possible.
import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (userId, moment, courseId) => `ea.journey.v1.${moment}.${userId}.${courseId}`;

export async function hasSeen(userId, moment, courseId) {
  try {
    return (await AsyncStorage.getItem(keyFor(userId, moment, courseId))) === "1";
  } catch (error) {
    return false;
  }
}

export async function markSeen(userId, moment, courseId) {
  try {
    await AsyncStorage.setItem(keyFor(userId, moment, courseId), "1");
  } catch (error) {
    // Not fatal: the moment may show once more.
  }
}
