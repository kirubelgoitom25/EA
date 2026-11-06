import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { accessLine, isLocked } from "../../services/access";
import { space, stone, tokens } from "../../theme";
import AppText from "./AppText";
import Emblem from "./Emblem";
import ProgressBar from "./ProgressBar";

export const COURSE_ROW = 64;

// A course in the Courses tab, in one line: its art, its title, and how far you are (a thin bar and
// the count, or a check when it is finished). Nothing else.
export default function CourseCard({ course, onPress }) {
  const total = course.totalLessons ?? 0;
  const done = course.completedLessons ?? 0;
  const progress = total > 0 ? Math.min(1, done / total) : 0;
  const finished = total > 0 && done >= total;
  const locked = isLocked(course);

  return (
    <Pressable
      onPress={() => onPress(course)}
      accessibilityRole="button"
      accessibilityLabel={`${course.title}, ${locked ? accessLine(course) : finished ? "finished" : `${done} of ${total} chapters`}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Emblem course={course} size={44} radius={14} />
      <AppText variant="bodyStrong" numberOfLines={1} style={styles.title}>
        {course.title}
      </AppText>
      <View style={styles.progress} importantForAccessibility="no-hide-descendants">
        {locked ? (
          <>
            <AppText variant="caption" tone="secondary">{accessLine(course)}</AppText>
            <Ionicons name="lock-closed" size={14} color={tokens.textTertiary} />
          </>
        ) : finished ? (
          <Ionicons name="checkmark" size={20} color={stone.moss} />
        ) : (
          <>
            <ProgressBar value={progress} height={5} fill={stone.moss} track={tokens.neutralTint} style={styles.bar} />
            <AppText variant="caption" tone="secondary" style={styles.count}>
              {done}/{total}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: COURSE_ROW,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },
  pressed: { opacity: 0.7 },
  title: { flex: 1 },
  progress: { flexDirection: "row", alignItems: "center", gap: space.sm },
  bar: { width: 44 },
  count: { minWidth: 28, textAlign: "right" },
});
