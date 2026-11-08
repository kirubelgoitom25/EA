import React, { useEffect, useMemo } from "react";
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, space, stone, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import { firstOpenChapter, flattenChapters } from "./session/sessionModel";
import AppText from "./ui/AppText";
import { Entrance, useCountUp, useFlicker } from "./ui/anim";
import EmptyState from "./ui/EmptyState";
import { useFoxReact } from "./ui/FoxContext";
import Screen, { TAB_BAR_HEIGHT } from "./ui/Screen";
import Route from "./ui/Route";
import { PathSkeleton } from "./ui/Skeleton";

// How many chapters of the trail Home shows around where you are.
const WINDOW = 5;

// Home is one thing: your trail through the course you're on, icon-only keys
// with the fox on top of the one you're at (tap it to keep going). Streak, XP
// and rank sit small at the top.
export default function HomeScreen({
  ranking = [],
  user,
  courses = [],
  availableCount = 0,
  loading = false, // "Your courses" is still being read from the phone
  onCourses,
  onExplore,
  onRanking,
  onSelectCourse,
  onContinueChapter,
  onHome,
  onProfile,
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const foxReact = useFoxReact();
  useEffect(() => {
    foxReact("open");
  }, [foxReact]);

  // Rank among the class ranking by total XP (same calculation as before).
  const rank = useMemo(() => {
    const others = ranking.filter((item) => item.id !== user.id);
    const combined = [...others, { id: user.id, xp: Number(user.xp) || 0 }].sort((a, b) => b.xp - a.xp);
    return combined.findIndex((item) => item.id === user.id) + 1;
  }, [ranking, user]);

  // The course to continue: the first in progress, else the first not
  // finished; its next chapter is the first not done.
  const resumeCourse =
    courses.find((course) => course.progress > 0 && course.progress < 100) ||
    courses.find((course) => course.progress < 100) ||
    null;
  const resumeChapter = resumeCourse ? firstOpenChapter(resumeCourse) : null;
  // Everything finished: the trail still shows — your first course, walked
  // all the way to the den.
  const trailCourse = resumeChapter ? resumeCourse : courses[0] ?? null;
  const finished = !resumeChapter;

  // The slice of the trail worth seeing: a couple of chapters behind you,
  // the one you're on, and what's ahead. The den shows once the end is near.
  const chapters = trailCourse ? flattenChapters(trailCourse) : [];
  const nextIndex = resumeChapter ? chapters.findIndex((c) => c.id === resumeChapter.id) : chapters.length;
  const end = Math.min(chapters.length, Math.max(nextIndex - 2, 0) + WINDOW);
  const start = Math.max(0, end - WINDOW);
  const visible = chapters.slice(start, end);

  const streak = Math.max(Number(user.streak) || 0, 0);
  const xp = Number(user.xp) || 0;
  const showTrail = chapters.length > 0;

  // The numbers count up on arrival; labels always read the real values.
  const streakShown = useCountUp(streak);
  const xpShown = useCountUp(xp);
  const rankShown = useCountUp(rank);
  const flame = useFlicker(streak);

  return (
    <View style={styles.root}>
      <Screen
        withTabBar
        background={stone.bg}
        contentStyle={[
          styles.content,
          showTrail && {
            paddingBottom: TAB_BAR_HEIGHT + insets.bottom + space.xxl,
          },
        ]}
      >
        <Entrance distance={-14} style={styles.top}>
          {showTrail ? (
            <Pressable
              onPress={() => (courses.length > 1 ? onCourses() : onSelectCourse(trailCourse))}
              accessibilityRole="button"
              accessibilityLabel={`${trailCourse.title}. ${courses.length > 1 ? "Switch course" : "Open course"}`}
              style={({ pressed }) => [styles.coursePill, pressed && styles.coursePillPressed]}
            >
              <AppText variant="label" numberOfLines={1} style={styles.courseName}>
                {trailCourse.title}
              </AppText>
              <Ionicons name="chevron-down" size={18} color={tokens.text} />
            </Pressable>
          ) : (
            <View />
          )}

          <View style={styles.topRight}>
            <View style={styles.stats}>
              <Stat accessibilityLabel={`${streak}-day streak`}>
                <Animated.View style={flame}><Ionicons name="flame" size={20} color={tokens.flame} /></Animated.View>
                <AppText variant="title" style={styles.statValue}>{streakShown}</AppText>
              </Stat>
              <Stat accessibilityLabel={`${xp} XP`}>
                <Ionicons name="flash" size={20} color={tokens.accentLip} />
                <AppText variant="title" style={styles.statValue}>{xpShown}</AppText>
              </Stat>
              <Stat onPress={onRanking} accessibilityLabel={`Rank ${rank} in your class. Open leaderboard`}>
                <Ionicons name="trophy-outline" size={20} color={tokens.text} />
                <AppText variant="title" style={styles.statValue}>{rankShown}</AppText>
              </Stat>
            </View>
            {availableCount > 0 ? (
              <Pressable
                onPress={onExplore}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityLabel="Explore courses"
                style={({ pressed }) => [styles.add, pressed && styles.pressed]}
              >
                <Ionicons name="add" size={22} color={tokens.onAccentStrong} />
              </Pressable>
            ) : null}
          </View>
        </Entrance>

        {showTrail ? (
          <Route
            cta={false}
            words={false}
            foxPlace="above"
            zigzag
            foxKey={`course-${trailCourse.id}`}
            style={styles.trail}
            items={visible.map((chapter, i) => {
              const number = start + i + 1;
              const status = chapter.completed ? "done" : chapter.id === resumeChapter?.id ? "next" : "todo";
              return {
                id: `chapter-${chapter.id}`,
                status,
                number,
                tag: `Chapter ${number}`,
                kicker: `Chapter ${number}`,
                title: chapter.title,
                caption: status === "done" ? "Done" : `Chapter ${number}`,
                accessibilityLabel: `Chapter ${number}, ${chapter.title}${status === "done" ? ", done" : status === "next" ? ", up next" : ""}`,
              };
            })}
            den={
              end === chapters.length
                ? { course: trailCourse, reached: finished, title: finished ? "You reached the den" : "The den", caption: "Course complete" }
                : null
            }
            onPress={(i) => onContinueChapter(trailCourse, visible[i])}
          />
        ) : loading ? (
          <PathSkeleton count={5} words={false} style={styles.trail} />
        ) : courses.length === 0 && availableCount > 0 ? (
          <EmptyState
            pose="waving"
            title="Choose your first course"
            message="Add a course from Explore to start your trail."
            actionLabel="Explore courses"
            actionIcon="compass"
            invite
            onAction={onExplore}
          />
        ) : courses.length > 0 ? (
          <EmptyState
            pose="waving"
            title="Chapters are on their way"
            message="Your courses don't have chapters yet."
            actionLabel="Browse courses"
            onAction={onCourses}
          />
        ) : (
          <EmptyState title="No courses yet" message="New courses will show up here soon." />
        )}
      </Screen>

      <BottomNavBar
        active="home"
        onNavigate={(tab) => {
          if (tab === "home") onHome?.();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile?.();
        }}
      />
    </View>
  );
}

function Stat({ children, onPress, accessibilityLabel }) {
  const body = <View style={styles.stat}>{children}</View>;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={space.sm}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  content: {
    paddingTop: space.xl,
  },

  pressed: {
    opacity: 0.7,
  },

  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },

  stats: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },

  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
  },

  statValue: {
    fontSize: 16,
    lineHeight: 20,
  },

  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },

  add: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: tokens.accent,
    borderBottomWidth: 3,
    borderBottomColor: tokens.accentLip,
    alignItems: "center",
    justifyContent: "center",
  },

  // the course picker: a white key with a soft lip
  coursePill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 44,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: 14,
    backgroundColor: tokens.surface,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: tokens.divider,
  },

  coursePillPressed: {
    borderBottomWidth: 2,
    marginTop: 2,
  },

  courseName: {
    flexShrink: 1,
    fontFamily: fonts.display,
  },

  trail: {
    marginTop: space.xl,
  },
});
