import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mascotVariant } from "../config";
import { accessLine, canRenew } from "../services/access";
import { loadProgressSummary } from "../services/chapterProgress";
import { hasSeen, markSeen } from "../services/journey";
import { chapterWord, isCourseComplete } from "../services/journeyModel";
import { layout, space, stone, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import JourneyMoment from "./JourneyMoment";
import { firstOpenChapter, flattenChapters } from "./session/sessionModel";
import AppText from "./ui/AppText";
import { FoxFigure } from "./ui/CourseFox";
import Button from "./ui/Button";
import DotGrid from "./ui/DotGrid";
import Emblem from "./ui/Emblem";
import EmptyState from "./ui/EmptyState";
import { LEDGE_FOX, scaleOf } from "./ui/foxPlacement";
import { useFoxReact } from "./ui/FoxContext";
import ProgressBar from "./ui/ProgressBar";
import Route, { routeMetrics } from "./ui/Route";
import { NAV_BAR_HEIGHT, TAB_BAR_HEIGHT } from "./ui/Screen";
import { useReducedMotion } from "./ui/motion";
import StatusBarScrim, { scrimOnScroll } from "./ui/StatusBarScrim";

// A course as a journey. No hero picture: the course's own emblem (its colour, pattern and subject)
// with a ring that fills as you go, its title, and straight below it the path of its chapters. The
// fox stands at the chapter you're on, which opens into a card with one button. Every chapter is open
// (nothing is locked); the path just shows where to go next. The page scrolls to your chapter.
// The first time the last chapter is done, the finale plays once.
export default function CourseScreen({
  userId,
  course,
  isMine,
  onToggleMine,
  onRenew,
  backLabel,
  onSelectLesson,
  onBack,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const insets = useSafeAreaInsets();
  const foxReact = useFoxReact();
  const scroll = useRef(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [away, setAway] = useState(null); // "above" / "below": your chapter is out of view
  const chapters = flattenChapters(course);
  const total = chapters.length;
  const next = firstOpenChapter(course);
  const nextIndex = next ? chapters.findIndex((chapter) => chapter.id === next.id) : -1;
  const doneCount = chapters.filter((chapter) => chapter.completed).length;
  const finished = isCourseComplete(course) || (total > 0 && doneCount === total);

  // Stages done on this phone for chapters not finished yet.
  const [stageProgress, setStageProgress] = useState({});
  useEffect(() => {
    let cancelled = false;
    loadProgressSummary(userId, chapters.map((chapter) => chapter.id)).then((summary) => {
      if (!cancelled) setStageProgress(summary);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, userId]);

  // The finale: once, the first time the student sees this course finished.
  const [finale, setFinale] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!finished) {
      setFinale(false);
      return undefined;
    }
    hasSeen(userId, "finale", course.id).then((seen) => {
      if (!cancelled && !seen) {
        setFinale(true);
        foxReact("courseDone");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [finished, userId, course.id]);
  const closeFinale = () => {
    setFinale(false);
    markSeen(userId, "finale", course.id);
  };

  // A chapter that starts a part of the course (a Studio chapter) gets a small dome on the path before it
  // that names the part when tapped.
  const firstOfModule = new Set((course.modules ?? []).map((module) => module.lessons?.[0]?.id));
  const moduleOf = {};
  (course.modules ?? []).forEach((module) => (module.lessons ?? []).forEach((lesson) => (moduleOf[lesson.id] = module.title)));
  const showParts = (course.modules ?? []).length > 1;

  const items = chapters.map((chapter, i) => {
    const number = i + 1;
    const partial = !chapter.completed && stageProgress[chapter.id];
    const status = chapter.completed ? "done" : next?.id === chapter.id ? "next" : "todo";
    const stages = partial && partial.stageCount ? `${partial.stagesDone} of ${partial.stageCount} stages` : null;
    const caption = status === "done" ? "Done" : stages ?? `Chapter ${number}`;
    return {
      status,
      number,
      eyebrow: showParts && firstOfModule.has(chapter.id) ? moduleOf[chapter.id] : undefined,
      tag: `Chapter ${number}`,
      kicker: `Chapter ${number}${partial && partial.stageCount ? ` · ${partial.stagesDone}/${partial.stageCount}` : ""}`,
      action: doneCount === 0 && !stages ? "Start" : "Continue",
      title: chapter.title,
      // the node shows the chapter's number, so the step only adds words when there are some
      caption: status === "done" ? caption : stages ?? undefined,
      accessibilityLabel: `Chapter ${number}, ${chapter.title}, ${status === "next" ? "up next" : caption}`,
    };
  });

  // A long path scrolls to the chapter you're on, so it is the first thing you see. A short one
  // already fits, and its header stays in view.
  const routeTop = useRef(0);
  const scrolledToNow = useRef(false);
  const nodeY = () => routeTop.current + routeMetrics(items, true).centers[nextIndex];
  const scrollToNow = () => {
    if (scrolledToNow.current || nextIndex < 0 || !scroll.current) return;
    scrolledToNow.current = true;
    const stopY = routeTop.current + routeMetrics(items, true).offsets[nextIndex];
    if (stopY + 170 > screenHeight - 220) {
      setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, stopY - screenHeight * 0.28), animated: true }), 500);
    }
  };

  // Is your chapter out of view? Then a pill says which way it is, and takes you there.
  const checkAway = (offset, viewHeight) => {
    if (nextIndex < 0 || finished) return setAway(null);
    const y = nodeY();
    if (y < offset + insets.top + 60) setAway("above");
    else if (y > offset + viewHeight - TAB_BAR_HEIGHT - insets.bottom - 60) setAway("below");
    else setAway(null);
  };
  const scrim = scrimOnScroll(24, scrolled, setScrolled);
  const jumpToNow = () => scroll.current?.scrollTo({ y: Math.max(0, nodeY() - screenHeight * 0.35), animated: true });

  return (
    <View style={styles.root}>
      {/* "ledge": the fox stands on the tab bar, drawn under the page so the path scrolls over her */}
      {mascotVariant === "ledge" ? (
        <FoxFigure
          spec={LEDGE_FOX}
          k={scaleOf(screenWidth)}
          motion="sway"
          reduce={reduce}
          style={{ position: "absolute", left: LEDGE_FOX.left * scaleOf(screenWidth), bottom: NAV_BAR_HEIGHT + insets.bottom }}
        />
      ) : null}
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrim(event);
          checkAway(event.nativeEvent.contentOffset.y, event.nativeEvent.layoutMeasurement.height);
        }}
        scrollEventThrottle={32}
      >
        <DotGrid />

        <View style={[styles.header, { paddingTop: insets.top + 60 }]}>
          <Emblem course={course} size={48} radius={15} />
          <View style={styles.titleBlock}>
            <AppText variant="title" numberOfLines={2} style={styles.title}>
              {course.title}
            </AppText>
            {total > 0 ? (
              <ProgressBar
                value={doneCount / total}
                height={5}
                fill={stone.moss}
                track={stone.rockLight}
                accessibilityLabel={`${doneCount} of ${total} ${chapterWord(total)} done`}
              />
            ) : null}
            {canRenew(course) ? (
              <Pressable onPress={onRenew} accessibilityRole="button" hitSlop={space.sm}>
                <AppText variant="caption" tone="secondary" style={styles.accessLine}>
                  {`${accessLine(course)} · `}
                  <AppText variant="caption" style={styles.renew}>Renew</AppText>
                </AppText>
              </Pressable>
            ) : null}
          </View>
        </View>

        {total === 0 ? (
          <EmptyState title="No chapters yet" message="Chapters will appear here soon." />
        ) : (
          <View
            style={styles.route}
            onLayout={(event) => {
              routeTop.current = event.nativeEvent.layout.y;
              scrollToNow();
              checkAway(0, screenHeight);
            }}
          >
            <Route
              items={items}
              mascot={mascotVariant}
              foxKey={`course-${course.id}`}
              den={{
                reached: finished,
                title: finished ? "You reached the den" : "The den",
                caption: finished ? "Course complete" : `${total - doneCount} ${chapterWord(total - doneCount)} to go`,
              }}
              onPress={(i) => onSelectLesson(chapters[i])}
            />
          </View>
        )}

        {onToggleMine ? (
          <Button
            variant="text"
            label={isMine ? "Remove from your courses" : "Add to your courses"}
            onPress={onToggleMine}
            style={styles.toggleMine}
          />
        ) : null}
      </ScrollView>

      <StatusBarScrim visible={scrolled} color={stone.bg} />

      {away && nextIndex >= 0 ? (
        <View style={[styles.jumpRow, { bottom: TAB_BAR_HEIGHT + insets.bottom + space.md }]} pointerEvents="box-none">
          <Pressable
            onPress={jumpToNow}
            accessibilityRole="button"
            accessibilityLabel={`Jump to chapter ${nextIndex + 1}`}
            style={({ pressed }) => [styles.jump, pressed && styles.pressed]}
          >
            <Ionicons name={away === "above" ? "arrow-up" : "arrow-down"} size={16} color={tokens.accentText} />
            <AppText variant="label" tone="accent">
              Chapter {nextIndex + 1}
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={onBack}
        hitSlop={space.sm}
        accessibilityRole="button"
        accessibilityLabel={backLabel ? `Back to ${backLabel}` : "Go back"}
        style={({ pressed }) => [styles.back, { top: insets.top + space.sm }, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={22} color={tokens.text} />
      </Pressable>

      <BottomNavBar
        active="courses"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile();
        }}
      />

      {finale ? (
        <View style={StyleSheet.absoluteFill}>
          <JourneyMoment
            course={course}
            celebrate
            overline="COURSE COMPLETE"
            title="You reached the den!"
            body={`You finished ${course.title}.`}
            chapters={total}
            done={total}
            caption={total === 1 ? "Chapter done" : `${total} of ${total} chapters done`}
            buttonLabel="See my journey"
            onPress={closeFinale}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  accessLine: { marginTop: space.xs },
  renew: { color: tokens.accentText },
  root: {
    flex: 1,
    backgroundColor: stone.bg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.gutter,
  },

  titleBlock: {
    flex: 1,
    gap: space.sm,
  },

  title: {
    fontSize: 22,
    lineHeight: 27,
  },

  route: {
    marginTop: space.lg,
    marginHorizontal: layout.gutter,
  },

  pressed: {
    opacity: 0.7,
  },

  jumpRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },

  jump: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: 14,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.divider,
    shadowColor: "#2B1A38",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  toggleMine: {
    marginTop: space.xl,
  },

  back: {
    position: "absolute",
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
