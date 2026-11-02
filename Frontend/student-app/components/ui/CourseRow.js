import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { layout, space, tokens } from "../../theme";
import AppText from "./AppText";
import Emblem from "./Emblem";

export const COURSE_ROW_HEIGHT = 72;

// One slim row in a long list of courses: the course's world emblem, the title, the chapter count
// and a + to add it. The row opens the course.
export default function CourseRow({ course, onOpen, onAdd }) {
  const chapters = course.totalLessons ?? 0;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onOpen(course)}
        accessibilityRole="button"
        accessibilityLabel={`${course.title}, ${chapters} chapters`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <Emblem course={course} size={48} />
        <View style={styles.text}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {course.title}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {chapters} {chapters === 1 ? "chapter" : "chapters"}
          </AppText>
        </View>
      </Pressable>

      <Pressable
        onPress={() => onAdd(course.id)}
        hitSlop={space.xs}
        accessibilityRole="button"
        accessibilityLabel={`Add ${course.title} to your courses`}
        style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
      >
        <Ionicons name="add" size={22} color={tokens.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: COURSE_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },

  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },

  pressed: {
    opacity: 0.7,
  },

  text: {
    flex: 1,
  },

  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: tokens.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  addPressed: {
    backgroundColor: tokens.accentTint,
  },
});
