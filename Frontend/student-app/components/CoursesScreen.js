import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius } from "../theme";
import BottomNavBar from "./BottomNavBar";

export default function CoursesScreen({
  courses,
  onSelectCourse,
  onBack,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Home</Text>
        </TouchableOpacity>

        <Text style={styles.title}>My Courses</Text>

        <Text style={styles.subtitle}>
          Continue learning and build your skills.
        </Text>

        {courses.map((course) => {
          const isDone = course.progress === 100;

          return (
            <TouchableOpacity
              key={course.id}
              style={styles.courseCard}
              activeOpacity={0.85}
              onPress={() => onSelectCourse(course)}
            >
              <View style={styles.courseTopRow}>
                <View style={styles.courseIcon}>
                  <Ionicons
                    name={isDone ? "trophy" : "book"}
                    size={22}
                    color="#fff"
                  />
                </View>

                <View style={styles.courseTextBlock}>
                  <Text style={styles.courseTitle}>{course.title}</Text>
                  <Text style={styles.description} numberOfLines={2}>
                    {course.description}
                  </Text>
                </View>
              </View>

              <Text style={styles.lessons}>
                {course.completedLessons} / {course.totalLessons} lessons
              </Text>

              <View style={styles.progressBackground}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${course.progress}%` },
                    isDone && { backgroundColor: colors.gold },
                  ]}
                />
              </View>

              <View style={styles.bottomRow}>
                <Text style={styles.progress}>
                  {course.progress}% complete
                </Text>

                <View style={styles.openPill}>
                  <Text style={styles.openCourse}>
                    {isDone ? "Review" : "Open"}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={14}
                    color={colors.green}
                  />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
    backgroundColor: colors.screenBg,
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  scrollContent: {
    paddingBottom: 110,
  },

  backButton: {
    marginTop: 40,
    fontSize: 15,
    fontWeight: "700",
    color: colors.blue,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    marginTop: 20,
    color: colors.text,
  },

  subtitle: {
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 22,
  },

  courseCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.border,
  },

  courseTopRow: {
    flexDirection: "row",
    marginBottom: 14,
  },

  courseIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  courseTextBlock: {
    flex: 1,
  },

  courseTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },

  description: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },

  lessons: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },

  progressBackground: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    marginTop: 8,
    overflow: "hidden",
  },

  progressBar: {
    height: 10,
    backgroundColor: colors.green,
    borderRadius: radius.full,
  },

  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },

  progress: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },

  openPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  openCourse: {
    fontWeight: "800",
    color: colors.green,
    fontSize: 13,
  },
});
