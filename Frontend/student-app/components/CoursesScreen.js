import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { space, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import AppText from "./ui/AppText";
import CourseCard from "./ui/CourseCard";
import EmptyState from "./ui/EmptyState";
import Header from "./ui/Header";
import Screen from "./ui/Screen";

// The Courses tab: the courses the student added, one slim row each (art, title, thin progress bar). Finding more is on the Explore page (the + at the top right).
export default function CoursesScreen({
  courses = [],
  myCourseIds = [],
  onExplore,
  onSelectCourse,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const mine = courses.filter((course) => myCourseIds.includes(course.id));

  return (
    <View style={styles.root}>
      <Screen withTabBar>
        <Header
          title="Courses"
          right={
            courses.length > 0 ? (
              <Pressable
                onPress={onExplore}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityLabel="Explore courses"
                style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
              >
                <Ionicons name="add" size={22} color={tokens.accent} />
              </Pressable>
            ) : null
          }
        />

        {courses.length === 0 ? (
          <EmptyState title="No courses yet" message="New courses will show up here soon." />
        ) : (
          <>
            {mine.length === 0 ? (
              <AppText tone="secondary" style={styles.hint}>
                Tap + to find your first course.
              </AppText>
            ) : (
              <View>
                {mine.map((course) => (
                  <CourseCard key={course.id} course={course} onPress={onSelectCourse} />
                ))}
              </View>
            )}
          </>
        )}
      </Screen>

      <BottomNavBar
        active="courses"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  flex: {
    flex: 1,
  },

  pressed: {
    opacity: 0.7,
  },


  hint: {
    paddingVertical: space.lg,
  },

  // A soft orange tile with a plus, the same rounded shape as the course art.
  add: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: tokens.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },

  addPressed: {
    opacity: 0.7,
  },

});
