import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { haptic } from "../services/feedback";
import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";

const NODE_SIZE = 58;

export default function CourseScreen({
  course,
  onSelectLesson,
  onBack,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  let firstIncompleteFound = false;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { haptic.light(); onBack(); }} activeOpacity={0.7} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={styles.backText}>Courses</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.courseHeader}>
          <Text style={styles.title}>{course.title}</Text>
          <Text style={styles.description}>{course.description}</Text>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressSmall}>YOUR PROGRESS</Text>
              <Text style={styles.progressPercent}>{course.progress}%</Text>
            </View>
            <View style={styles.progressIcon}>
              <Ionicons name="trending-up" size={22} color={colors.orangeDeep} />
            </View>
          </View>

          <View style={styles.progressBackground}>
            <View style={[styles.progressBar, { width: `${course.progress}%` }]} />
          </View>
        </View>

        {course.modules.map((module, moduleIndex) => (
          <View key={module.id} style={styles.module}>
            <View style={styles.moduleHeader}>
              <View style={styles.moduleNumber}>
                <Text style={styles.moduleNumberText}>{moduleIndex + 1}</Text>
              </View>

              <View style={styles.moduleHeaderText}>
                <Text style={styles.moduleLabel}>MODULE {moduleIndex + 1}</Text>
                <Text style={styles.moduleTitle}>{module.title}</Text>
              </View>
            </View>

            <View style={styles.lessonList}>
              {module.lessons.map((lesson, lessonIndex) => {
                const isCompleted = lesson.completed;
                const isCurrent = !isCompleted && !firstIncompleteFound;

                if (isCurrent) firstIncompleteFound = true;
                const isLocked = !isCompleted && !isCurrent;

                return (
                  <View key={lesson.id} style={styles.lessonRow}>
                    <View style={styles.pathColumn}>
                      {lessonIndex > 0 && (
                        <View style={[styles.pathLineTop, isCompleted ? styles.pathCompleted : styles.pathLocked]} />
                      )}

                      {lessonIndex < module.lessons.length - 1 && (
                        <View style={[styles.pathLineBottom, isCompleted ? styles.pathCompleted : styles.pathLocked]} />
                      )}

                      <TouchableOpacity
                        activeOpacity={0.8}
                        disabled={isLocked}
                        onPress={() => { haptic.light(); onSelectLesson(lesson); }}
                        style={[styles.node, isCompleted && styles.nodeCompleted, isCurrent && styles.nodeCurrent, isLocked && styles.nodeLocked]}
                      >
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={26} color="#fff" />
                        ) : isCurrent ? (
                          <Ionicons name="play" size={23} color="#fff" style={{ marginLeft: 2 }} />
                        ) : (
                          <Ionicons name="lock-closed" size={20} color={colors.textMuted} />
                        )}
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      disabled={isLocked}
                      onPress={() => { haptic.light(); onSelectLesson(lesson); }}
                      style={[styles.lessonCard, isCurrent && styles.lessonCardCurrent, isLocked && styles.lessonCardLocked]}
                    >
                      <View style={styles.lessonText}>
                        <Text style={[styles.lessonNumber, isLocked && styles.textLocked]}>LESSON {lessonIndex + 1}</Text>
                        <Text style={[styles.lessonTitle, isLocked && styles.textLocked]} numberOfLines={2}>{lesson.title}</Text>
                        {isCompleted && <Text style={styles.completedText}>Completed</Text>}
                        {isCurrent && <Text style={styles.startText}>Continue learning →</Text>}
                        {isLocked && <Text style={styles.lockedText}>Complete previous lesson</Text>}
                      </View>

                      {isCurrent && (
                        <View style={styles.continueButton}>
                          <Ionicons name="arrow-forward" size={20} color="#fff" />
                        </View>
                      )}

                      {isCompleted && <Ionicons name="checkmark-circle" size={25} color={colors.mint} />}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
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
  scrollContent: { paddingTop: 18, paddingBottom: 120 },

  header: { marginBottom: 18 },
  backButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingVertical: 6, paddingRight: 12 },
  backText: { fontSize: 15, fontWeight: "700", color: colors.text },

  courseHeader: { marginBottom: 22 },
  title: { fontSize: 30, fontWeight: "900", color: colors.text, letterSpacing: -0.7 },
  description: { marginTop: 7, fontSize: 14, lineHeight: 21, color: colors.textSecondary },

  progressCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 18, marginBottom: 30, borderWidth: 1, borderColor: colors.border },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressSmall: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: colors.textMuted },
  progressPercent: { marginTop: 2, fontSize: 24, fontWeight: "900", color: colors.text },
  progressIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.orangeLight, alignItems: "center", justifyContent: "center" },
  progressBackground: { height: 10, backgroundColor: colors.bgSecondary, borderRadius: 10, marginTop: 15, overflow: "hidden" },
  progressBar: { height: "100%", backgroundColor: colors.orange, borderRadius: 10 },

  module: { marginBottom: 32 },
  moduleHeader: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  moduleNumber: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center", marginRight: 12 },
  moduleNumberText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  moduleHeaderText: { flex: 1 },
  moduleLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "800", letterSpacing: 1 },
  moduleTitle: { fontSize: 18, color: colors.text, fontWeight: "800", marginTop: 3 },

  lessonList: { paddingLeft: 8 },
  lessonRow: { flexDirection: "row", alignItems: "stretch", marginBottom: 12 },
  pathColumn: { width: NODE_SIZE, alignItems: "center", position: "relative" },
  pathLineTop: { position: "absolute", top: -12, width: 2, height: 20, backgroundColor: colors.border },
  pathLineBottom: { position: "absolute", bottom: -12, width: 2, height: 20, backgroundColor: colors.border },
  pathCompleted: { backgroundColor: colors.mint },
  pathLocked: { backgroundColor: colors.border },

  node: { width: NODE_SIZE, height: NODE_SIZE, borderRadius: NODE_SIZE / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, zIndex: 2 },
  nodeCompleted: { backgroundColor: colors.mint, borderColor: colors.mint },
  nodeCurrent: { backgroundColor: colors.orange, borderColor: colors.orange },
  nodeLocked: { backgroundColor: colors.bgSecondary, borderColor: colors.border },

  lessonCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, paddingHorizontal: 14, marginLeft: 10, flexDirection: "row", alignItems: "center" },
  lessonCardCurrent: { borderColor: colors.orange, backgroundColor: colors.orangeLight },
  lessonCardLocked: { opacity: 0.8 },
  lessonText: { flex: 1 },
  lessonNumber: { fontSize: 11, color: colors.textMuted, fontWeight: "800", letterSpacing: 0.8 },
  lessonTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 5 },
  completedText: { marginTop: 5, color: colors.mint, fontWeight: "700", fontSize: 12 },
  startText: { marginTop: 5, color: colors.orangeDeep, fontWeight: "700", fontSize: 12 },
  lockedText: { marginTop: 5, color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  textLocked: { color: colors.textMuted },
  continueButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center", marginLeft: 10 },
});
