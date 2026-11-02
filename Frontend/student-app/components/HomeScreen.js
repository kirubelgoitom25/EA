import React, { useEffect, useMemo } from "react";
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient as Fade } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout, space, stone, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import { firstOpenChapter, flattenChapters } from "./session/sessionModel";
import AppText from "./ui/AppText";
import { Entrance, useCountUp, useFlicker } from "./ui/anim";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import { useFoxReact } from "./ui/FoxContext";
import Screen, { TAB_BAR_HEIGHT } from "./ui/Screen";
import Route from "./ui/Route";

// How many chapters of the trail Home shows around where you are.
const WINDOW = 5;

// Home is one thing: your trail through the course you're on, with the fox
// where you are and one button to keep going. Streak, XP and rank sit small
// at the top.
export default function HomeScreen({
  ranking = [],
  user,
  courses = [],
  availableCount = 0,
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
        grid
        background={stone.bg}
        contentStyle={[
          styles.content,
          showTrail && {
            paddingBottom: TAB_BAR_HEIGHT + insets.bottom + (finished ? 0 : layout.buttonHeight) + space.xxl,
          },
        ]}
      >
        <Entrance distance={-14} style={styles.top}>
          <View style={styles.stats}>
            <Stat accessibilityLabel={`${streak}-day streak`}>
              <TailFlame style={flame} />
              <AppText variant="title" style={styles.statValue}>{streakShown}</AppText>
            </Stat>
            <Stat accessibilityLabel={`${xp} XP`}>
              <Ionicons name="star" size={16} color={tokens.accent} />
              <AppText variant="title" style={styles.statValue}>{xpShown}</AppText>
            </Stat>
            <Stat onPress={onRanking} accessibilityLabel={`Rank ${rank} in your class. Open leaderboard`}>
              <Ionicons name="trophy" size={16} color={tokens.accent} />
              <AppText variant="title" style={styles.statValue}>{rankShown}</AppText>
            </Stat>
          </View>

          <View style={styles.topRight}>
          {showTrail ? (
            <Pressable
              onPress={() => (courses.length > 1 ? onCourses() : onSelectCourse(trailCourse))}
              accessibilityRole="button"
              accessibilityLabel={`${trailCourse.title}. ${courses.length > 1 ? "Switch course" : "Open course"}`}
              style={({ pressed }) => [styles.coursePill, pressed && styles.pressed]}
            >
              <AppText variant="label" numberOfLines={1} style={styles.courseName}>
                {trailCourse.title}
              </AppText>
              <Ionicons name="chevron-down" size={14} color={tokens.textSecondary} />
            </Pressable>
          ) : null}
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
            foxKey={`course-${trailCourse.id}`}
            style={styles.trail}
            items={visible.map((chapter, i) => {
              const number = start + i + 1;
              const status = chapter.completed ? "done" : chapter.id === resumeChapter?.id ? "next" : "todo";
              return {
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
          <EmptyState title="No courses yet" message="Your teacher hasn't added courses to your class yet." />
        )}
      </Screen>

      {showTrail && !finished ? (
        <View style={[styles.cta, { bottom: 0, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + space.md }]} pointerEvents="box-none">
          <Fade
            colors={["rgba(250,251,251,0)", tokens.bg]}
            locations={[0, 0.55]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Entrance delay={500} distance={40}>
            <Button
              label="Continue"
              accessibilityLabel={`Continue ${resumeChapter.title}`}
              onPress={() => onContinueChapter(resumeCourse, resumeChapter)}
            />
          </Entrance>
        </View>
      ) : null}

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

// The streak flame, filled with the Tail.
function TailFlame({ style }) {
  return (
    <Animated.View style={style}>
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={tokens.tailEnd} />
          <Stop offset="1" stopColor={tokens.tailStart} />
        </LinearGradient>
      </Defs>
      <Path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z" fill="url(#flame)" />
    </Svg>
    </Animated.View>
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
    gap: space.lg,
  },

  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
  },

  statValue: {
    fontSize: 17,
    lineHeight: 22,
  },

  topRight: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },

  add: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  coursePill: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: 18,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.divider,
  },

  courseName: {
    flexShrink: 1,
  },

  trail: {
    marginTop: space.xl,
  },

  cta: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingTop: space.xxl,
    paddingHorizontal: layout.gutter,
  },
});
