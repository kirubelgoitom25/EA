import React, { useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import { accessLine, isLocked } from "../../services/access";
import AppText from "./AppText";
import CourseIcon from "./CourseIcon";
import CourseRing from "./CourseRing";

export const COURSE_ROW = 96;
export const NAME_LEFT = 106; // where the name (and the divider under it) starts, inside the row

const SINK = 5; // how far a tap pushes the row down

// A course in the Courses tab: a 96 dp row on white. Its icon sits inside a progress ring (chapters
// done / total), then the name and "5 of 20 chapters", and a chevron. A finished course has a full
// ring, a check badge on the icon and "Completed". A course not paid for keeps its access line and a
// lock where the chevron would be.
export default function CourseCard({ course, onPress }) {
  const total = course.totalLessons ?? 0;
  const done = course.completedLessons ?? 0;
  const progress = total > 0 ? Math.min(1, done / total) : 0;
  const finished = total > 0 && done >= total;
  const locked = isLocked(course);
  const count = `${done} of ${total} ${total === 1 ? "chapter" : "chapters"}`;
  const sub = locked ? accessLine(course) : finished ? "Completed" : count;

  const press = useRef(new Animated.Value(0)).current;
  const down = () =>
    Animated.timing(press, { toValue: SINK, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  const up = () => Animated.spring(press, { toValue: 0, friction: 5, tension: 220, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={() => onPress(course)}
      onPressIn={down}
      onPressOut={up}
      accessibilityRole="button"
      accessibilityLabel={`${course.title}, ${locked ? accessLine(course) : finished ? "completed" : `${done} of ${total} chapters`}`}
    >
      <Animated.View style={[styles.row, { transform: [{ translateY: press }] }]}>
        <CourseRing progress={locked ? 0 : progress} style={styles.ring} />
        <CourseIcon course={course} size={56} radius={16} style={styles.icon} />

        {finished && !locked ? (
          <View style={styles.badge} importantForAccessibility="no-hide-descendants">
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
              <Path d="M20 6 9 17l-5-5" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        ) : null}

        <AppText numberOfLines={1} style={styles.name}>
          {course.title}
        </AppText>
        <AppText numberOfLines={1} style={[styles.sub, finished && !locked && styles.subDone]}>
          {sub}
        </AppText>

        <View style={styles.chevron} importantForAccessibility="no-hide-descendants">
          {locked ? (
            <Ionicons name="lock-closed" size={18} color={CHEVRON} />
          ) : (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="m9 6 6 6-6 6" stroke={CHEVRON} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const CHEVRON = "#9AA39E";

const styles = StyleSheet.create({
  row: { height: COURSE_ROW, borderRadius: 24, backgroundColor: "#FFFFFF" },
  ring: { position: "absolute", left: 6, top: 6 },
  icon: { position: "absolute", left: 20, top: 20 },
  badge: {
    position: "absolute",
    left: 68,
    top: 66,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#5E9C7D",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    position: "absolute",
    left: NAME_LEFT,
    right: 44,
    top: 22,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.44,
    fontFamily: "PlusJakartaSans_800ExtraBold",
  },
  sub: {
    position: "absolute",
    left: NAME_LEFT,
    right: 44,
    top: 54,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#5F6663",
  },
  subDone: { color: "#3F7359" },
  chevron: { position: "absolute", right: 14, top: 37, width: 22, height: 22, alignItems: "center", justifyContent: "center" },
});
