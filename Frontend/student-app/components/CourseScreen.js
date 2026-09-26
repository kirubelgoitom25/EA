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
  let firstIncompleteFound = false;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.7}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={styles.backText}>Courses</Text>
          </TouchableOpacity>
        </View>

        {/* Course Header */}
        <View style={styles.courseHeader}>
          <Text style={styles.title}>{course.title}</Text>

          <Text style={styles.description}>
            {course.description}
          </Text>
        </View>

        {/* Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressSmall}>YOUR PROGRESS</Text>
              <Text style={styles.progressPercent}>
                {course.progress}%
              </Text>
            </View>

            <View style={styles.progressIcon}>
              <Ionicons
                name="trending-up"
                size={22}
                color={colors.green}
              />
            </View>
          </View>

          <View style={styles.progressBackground}>
            <View
              style={[
                styles.progressBar,
                { width: `${course.progress}%` },
              ]}
            />
          </View>
        </View>

        {/* Modules */}
        {course.modules.map((module, moduleIndex) => (
          <View key={module.id} style={styles.module}>
            {/* Module Header */}
            <View style={styles.moduleHeader}>
              <View style={styles.moduleNumber}>
                <Text style={styles.moduleNumberText}>
                  {moduleIndex + 1}
                </Text>
              </View>

              <View style={styles.moduleHeaderText}>
                <Text style={styles.moduleLabel}>
                  MODULE {moduleIndex + 1}
                </Text>

                <Text style={styles.moduleTitle}>
                  {module.title}
                </Text>
              </View>
            </View>

            {/* Lesson Path */}
            <View style={styles.lessonList}>
              {module.lessons.map((lesson, lessonIndex) => {
                const isCompleted = lesson.completed;

                const isCurrent =
                  !isCompleted && !firstIncompleteFound;

                if (isCurrent) {
                  firstIncompleteFound = true;
                }

                const isLocked =
                  !isCompleted && !isCurrent;

                return (
                  <View
                    key={lesson.id}
                    style={styles.lessonRow}
                  >
                    {/* Vertical Path */}
                    <View style={styles.pathColumn}>
                      {lessonIndex > 0 && (
                        <View
                          style={[
                            styles.pathLineTop,
                            isCompleted
                              ? styles.pathCompleted
                              : styles.pathLocked,
                          ]}
                        />
                      )}

                      {lessonIndex <
                        module.lessons.length - 1 && (
                        <View
                          style={[
                            styles.pathLineBottom,
                            isCompleted
                              ? styles.pathCompleted
                              : styles.pathLocked,
                          ]}
                        />
                      )}

                      {/* Lesson Node */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        disabled={isLocked}
                        onPress={() =>
                          onSelectLesson(lesson)
                        }
                        style={[
                          styles.node,
                          isCompleted &&
                            styles.nodeCompleted,
                          isCurrent &&
                            styles.nodeCurrent,
                          isLocked &&
                            styles.nodeLocked,
                        ]}
                      >
                        {isCompleted ? (
                          <Ionicons
                            name="checkmark"
                            size={26}
                            color="#fff"
                          />
                        ) : isCurrent ? (
                          <Ionicons
                            name="play"
                            size={23}
                            color="#fff"
                            style={{ marginLeft: 2 }}
                          />
                        ) : (
                          <Ionicons
                            name="lock-closed"
                            size={20}
                            color={colors.textMuted}
                          />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Lesson Information */}
                    <TouchableOpacity
                      activeOpacity={0.75}
                      disabled={isLocked}
                      onPress={() =>
                        onSelectLesson(lesson)
                      }
                      style={[
                        styles.lessonCard,
                        isCurrent &&
                          styles.lessonCardCurrent,
                        isLocked &&
                          styles.lessonCardLocked,
                      ]}
                    >
                      <View style={styles.lessonText}>
                        <Text
                          style={[
                            styles.lessonNumber,
                            isLocked &&
                              styles.textLocked,
                          ]}
                        >
                          LESSON {lessonIndex + 1}
                        </Text>

                        <Text
                          style={[
                            styles.lessonTitle,
                            isLocked &&
                              styles.textLocked,
                          ]}
                          numberOfLines={2}
                        >
                          {lesson.title}
                        </Text>

                        {isCompleted && (
                          <Text style={styles.completedText}>
                            Completed
                          </Text>
                        )}

                        {isCurrent && (
                          <Text style={styles.startText}>
                            Continue learning →
                          </Text>
                        )}

                        {isLocked && (
                          <Text style={styles.lockedText}>
                            Complete previous lesson
                          </Text>
                        )}
                      </View>

                      {isCurrent && (
                        <View style={styles.continueButton}>
                          <Ionicons
                            name="arrow-forward"
                            size={20}
                            color="#fff"
                          />
                        </View>
                      )}

                      {isCompleted && (
                        <Ionicons
                          name="checkmark-circle"
                          size={25}
                          color={colors.green}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Navigation */}
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
    paddingTop: 18,
    paddingBottom: 120,
  },

  /* ---------------- HEADER ---------------- */

  header: {
    marginBottom: 18,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 12,
  },

  backText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },

  /* ---------------- COURSE HEADER ---------------- */

  courseHeader: {
    marginBottom: 22,
  },

  title: {
    fontSize: 30,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.7,
  },

  description: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },

  /* ---------------- PROGRESS ---------------- */

  progressCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 34,
    borderWidth: 1,
    borderColor: colors.border,
  },

  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  progressSmall: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.textMuted,
  },

  progressPercent: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
  },

  progressIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EAF8F0",
    alignItems: "center",
    justifyContent: "center",
  },

  progressBackground: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 10,
    marginTop: 15,
    overflow: "hidden",
  },

  progressBar: {
    height: "100%",
    backgroundColor: colors.green,
    borderRadius: 10,
  },

  /* ---------------- MODULE ---------------- */

  module: {
    marginBottom: 38,
  },

  moduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },

  moduleNumber: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },

  moduleNumberText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },

  moduleHeaderText: {
    marginLeft: 12,
    flex: 1,
  },

  moduleLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.textMuted,
  },

  moduleTitle: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },

  /* ---------------- LESSON PATH ---------------- */

  lessonList: {
    marginLeft: 2,
  },

  lessonRow: {
    flexDirection: "row",
    minHeight: 94,
  },

  pathColumn: {
    width: NODE_SIZE,
    alignItems: "center",
    position: "relative",
  },

  pathLineTop: {
    position: "absolute",
    width: 4,
    height: 47,
    top: 0,
    borderRadius: 4,
  },

  pathLineBottom: {
    position: "absolute",
    width: 4,
    height: 47,
    top: 47,
    borderRadius: 4,
  },

  pathCompleted: {
    backgroundColor: colors.green,
  },

  pathLocked: {
    backgroundColor: colors.border,
  },

  /* ---------------- NODE ---------------- */
node: {
  width: 52,
  height: 52,
  borderRadius: 26,
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
  marginTop: 15,
},

nodeCompleted: {
  backgroundColor: colors.green,
  borderWidth: 3,
  borderColor: "#DDF5E7",

  shadowColor: colors.green,
  shadowOpacity: 0.18,
  shadowRadius: 5,
  shadowOffset: {
    width: 0,
    height: 2,
  },
  elevation: 3,
},

nodeCurrent: {
  width: 56,
  height: 56,
  borderRadius: 28,
  backgroundColor: colors.blue,

  borderWidth: 4,
  borderColor: "#fff",

  shadowColor: colors.blue,
  shadowOpacity: 0.3,
  shadowRadius: 8,
  shadowOffset: {
    width: 0,
    height: 3,
  },
  elevation: 5,
},

nodeLocked: {
  backgroundColor: "#EEF0F2",
  borderWidth: 1,
  borderColor: "#D9DDE2",
},
  /* ---------------- LESSON CARD ---------------- */

  lessonCard: {
    flex: 1,
    minHeight: 76,
    marginLeft: 14,
    marginTop: 18,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },

  lessonCardCurrent: {
    borderWidth: 2,
    borderColor: colors.blue,
    backgroundColor: "#F7FAFF",
  },

  lessonCardLocked: {
    backgroundColor: "#F5F6F7",
    opacity: 0.65,
  },

  lessonText: {
    flex: 1,
  },

  lessonNumber: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: colors.textMuted,
  },

  lessonTitle: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },

  completedText: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: colors.green,
  },

  startText: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "700",
    color: colors.blue,
  },

  lockedText: {
    marginTop: 3,
    fontSize: 10,
    color: colors.textMuted,
  },

  textLocked: {
    color: colors.textMuted,
  },

  continueButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
});
