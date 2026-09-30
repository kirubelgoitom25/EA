import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";

const getCourseVisual = (title = "", colors) => {
  const lower = title.toLowerCase();

  if (/python|code|javascript|programming|script/.test(lower)) {
    return { icon: "code-slash", color: colors.blue, bg: colors.blueLight };
  }

  if (/english|spanish|french|language/.test(lower)) {
    return { icon: "language", color: colors.purple, bg: "#F3EAFF" };
  }

  return { icon: "book", color: colors.orangeDeep, bg: colors.orangeLight };
};

function CourseCard({ course, index, onSelectCourse, colors, styles }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const visual = getCourseVisual(course.title, colors);
  const isDone = course.progress === 100;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 280,
      delay: index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance, index]);

  useEffect(() => {
    const progressValue = Math.max(0, Math.min(Number(course.progress) || 0, 100)) / 100;
    Animated.timing(progress, {
      toValue: progressValue,
      duration: 520,
      delay: 100 + index * 40,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [course.progress, index, progress]);

  const entranceScale = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });
  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Pressable
      onPress={() => onSelectCourse(course)}
      onPressIn={() =>
        Animated.timing(pressScale, {
          toValue: 0.985,
          duration: 75,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(pressScale, {
          toValue: 1,
          speed: 24,
          bounciness: 4,
          useNativeDriver: true,
        }).start()
      }
      accessibilityRole="button"
      accessibilityLabel={`${course.title}, ${course.progress}% complete, ${isDone ? "Review" : "Open"}`}
    >
      <Animated.View
        style={[
          styles.courseCard,
          {
            opacity: entrance,
            transform: [
              { translateY },
              { scale: Animated.multiply(pressScale, entranceScale) },
            ],
          },
        ]}
      >
        <View style={styles.courseTopRow}>
          <View style={[styles.courseIcon, { backgroundColor: visual.bg }]}>
            <Ionicons name={visual.icon} size={22} color={visual.color} />
          </View>

          <View style={styles.courseTextBlock}>
            <Text style={styles.courseTitle}>{course.title}</Text>
            <Text style={styles.description} numberOfLines={2}>
              {course.description}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.lessons}>
            {course.completedLessons} / {course.totalLessons} lessons
          </Text>
          {isDone && <Text style={styles.completedTag}>Completed</Text>}
        </View>

        <View style={styles.progressBackground}>
          <Animated.View
            style={[
              styles.progressBar,
              { width: progressWidth },
              isDone && { backgroundColor: colors.yellow },
            ]}
          />
        </View>

        <View style={styles.bottomRow}>
          <Text style={styles.progress}>{course.progress}% complete</Text>

          <View style={styles.openPill}>
            <Text style={styles.openCourse}>{isDone ? "Review" : "Open"}</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.orangeDeep} />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function CoursesScreen({
  courses,
  onSelectCourse,
  onBack,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const headerEntrance = useRef(new Animated.Value(0)).current;
  const backScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(headerEntrance, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headerEntrance]);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            opacity: headerEntrance,
            transform: [
              {
                translateY: headerEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [9, 0],
                }),
              },
            ],
          }}
        >
          <Pressable
            onPress={onBack}
            onPressIn={() =>
              Animated.timing(backScale, {
                toValue: 0.96,
                duration: 75,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.spring(backScale, {
                toValue: 1,
                speed: 24,
                bounciness: 4,
                useNativeDriver: true,
              }).start()
            }
            accessibilityRole="button"
          >
            <Animated.View
              style={[styles.backButton, { transform: [{ scale: backScale }] }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.text} />
              <Text style={styles.backLabel}>Home</Text>
            </Animated.View>
          </Pressable>

          <Text style={styles.eyebrow}>Your learning</Text>
          <Text style={styles.title}>My Courses</Text>
        </Animated.View>

        {courses.map((course, index) => (
          <CourseCard
            key={course.id}
            course={course}
            index={index}
            onSelectCourse={onSelectCourse}
            colors={colors}
            styles={styles}
          />
        ))}
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

const createStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.screenBg },
  container: { flex: 1, paddingHorizontal: 20 },
  scrollContent: { paddingTop: 46, paddingBottom: 120 },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 10,
    gap: 6,
  },
  backLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  eyebrow: {
    fontSize: 12,
    color: colors.orangeDeep,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.8,
    marginBottom: 20,
  },

  courseCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  courseTopRow: { flexDirection: "row", marginBottom: 14 },
  courseIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  courseTextBlock: { flex: 1 },
  courseTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  description: { color: colors.textSecondary, marginTop: 4, fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  lessons: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  completedTag: { fontSize: 11, color: colors.mint, fontWeight: "800" },
  progressBackground: { height: 10, backgroundColor: colors.bgSecondary, borderRadius: radius.full, overflow: "hidden", marginTop: 6 },
  progressBar: { height: 10, backgroundColor: colors.orange, borderRadius: radius.full },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  progress: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
  openPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.orangeLight, borderRadius: radius.full },
  openCourse: { fontWeight: "800", color: colors.orangeDeep, fontSize: 12 },
});
