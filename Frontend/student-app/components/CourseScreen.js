import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mascotVariant } from "../config";
import { accessLine, canRenew } from "../services/access";
import { loadProgressSummary } from "../services/chapterProgress";
import { hasSeen, markSeen } from "../services/journey";
import { chapterWord, isCourseComplete } from "../services/journeyModel";
import { layout, levelLabel, space, stone, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import { PANEL_HEIGHT, cachedChapter, prefetchChapter } from "./ChapterPathScreen";
import { chapterPath } from "./chapterPathModel";
import JourneyMoment from "./JourneyMoment";
import { firstOpenChapter, flattenChapters } from "./session/sessionModel";
import AppText from "./ui/AppText";
import { useArrival } from "./ui/arrival";
import { FoxFigure } from "./ui/CourseFox";
import Button from "./ui/Button";
import DotGrid from "./ui/DotGrid";
import Emblem from "./ui/Emblem";
import EmptyState from "./ui/EmptyState";
import { LEDGE_FOX, scaleOf } from "./ui/foxPlacement";
import { useFoxReact } from "./ui/FoxContext";
import { ADVANCE, ARRIVAL, SCREEN } from "./ui/pathMotionModel";
import { handOff, takeHandoff } from "./ui/handoff";
import { pathPoints } from "./ui/pathModel";
import Rock, { rockBox } from "./ui/Rock";
import { win } from "./ui/StepMorph";
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
// the bar fills in step with the path's advance
const BAR_CHANGE = { delay: ADVANCE.lead + ADVANCE.bar[0], duration: ADVANCE.bar[1] - ADVANCE.bar[0] };

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
  const arrival = useArrival(course.id); // the first open in a session plays its arrival
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
      id: `chapter-${chapter.id}`,
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
  // How far the page has scrolled past the top of the route, for the route's moving line.
  const routeScroll = useRef(new Animated.Value(0)).current;
  const scrolledToNow = useRef(false);
  const nodeY = () => routeTop.current + routeMetrics(items, true).centers[nextIndex];
  // Where that leaves the page.
  const landingY = () => {
    if (nextIndex < 0) return 0;
    const stopY = routeTop.current + routeMetrics(items, true).offsets[nextIndex];
    return stopY + 170 > screenHeight - 220 ? Math.max(0, stopY - screenHeight * 0.28) : 0;
  };
  const scrollToNow = () => {
    if (scrolledToNow.current || nextIndex < 0 || !scroll.current) return;
    scrolledToNow.current = true;
    const y = landingY();
    if (y > 0) setTimeout(() => scroll.current?.scrollTo({ y, animated: true }), 500);
  };

  // The arrival plays what will be in view once the page has landed.
  const startArrival = () => {
    const { centers, den, total: height } = routeMetrics(items, true);
    const landing = landingY();
    const top = landing - routeTop.current;
    arrival?.start({
      stops: [...centers, den.center],
      top,
      bottom: top + screenHeight - TAB_BAR_HEIGHT - insets.bottom,
      total: height,
      lead: landing > 0 ? ARRIVAL.scrollLead : ARRIVAL.lead,
    });
  };
  useEffect(() => {
    if (total === 0) arrival?.start({ stops: [], top: 0, bottom: 0, total: 0 });
  }, [total, arrival]);

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

  // The chapter you are on is loaded ahead, so it opens at once and its tile knows where to travel.
  useEffect(() => {
    if (next) prefetchChapter(userId, next.id);
  }, [userId, next?.id]);

  // Back from a chapter page: this page fades in (from a little larger) and its advance waits for it.
  const [arriving] = useState(() => (!reduce && takeHandoff("backToCourse", course.id) ? new Animated.Value(0) : null));
  useEffect(() => {
    if (!arriving) return undefined;
    const run = Animated.timing(arriving, { toValue: 1, duration: SCREEN.back.in, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [arriving]);

  // Continue on the chapter you are on: the page leaves (SCREEN.exit) and the chapter's tile travels to
  // where its current lesson will be on the chapter page, which then starts from that very frame. Only
  // when that lesson is known (the chapter was loaded ahead) and lands on the first screen; otherwise
  // (and with reduce motion) the chapter simply opens. A tap while it plays finishes it at once.
  const scrollNow = useRef(0);
  // One clock for the whole exit, wired into the page from the start (at rest at 0), so starting it
  // needs no re-render of this heavy page: only the travelling tile draws itself.
  const exitClock = useRef(new Animated.Value(0)).current;
  const exit = useMemo(() => (nextIndex >= 0 ? { clock: exitClock, index: nextIndex } : null), [exitClock, nextIndex]);
  const exitLooks = useMemo(
    () => ({
      title: { opacity: win(exitClock, SCREEN.exit.title, 1, 0) },
      others: { opacity: win(exitClock, SCREEN.exit.others, 1, 0) },
      tabs: { transform: [{ translateY: win(exitClock, SCREEN.exit.tabs, 0, SCREEN.exit.tabsPx) }] },
    }),
    [exitClock],
  );
  useEffect(() => () => exitClock.stopAnimation(), [exitClock]);
  const flyer = useRef(null);
  const flight = useRef(null); // the plan while it plays
  const left = useRef(false);
  const finishLeaving = () => {
    const plan = flight.current;
    if (!plan || left.current) return;
    left.current = true;
    handOff("lessons", plan.chapter.id, { target: plan.target });
    onSelectLesson(plan.chapter);
  };
  const travelPlan = (i) => {
    const chapter = chapters[i];
    const cached = cachedChapter(userId, chapter.id);
    if (!cached || cached.phase !== "ready") return null;
    const path = chapterPath(cached, chapter);
    const target = path.nextAt;
    if (target < 0) return null;
    const pathWidth = screenWidth - layout.gutter * 2;
    const there = pathPoints(path.routeItems, true, pathWidth, true, true, { frame: screenWidth });
    const to = { x: layout.gutter + there.points[target].x, y: insets.top + PANEL_HEIGHT + space.xl + there.layout.centers[target] };
    if (to.y + 90 > screenHeight) return null;
    const here = pathPoints(items, true, pathWidth, true, true, { frame: screenWidth });
    const from = { x: layout.gutter + here.points[i].x, y: routeTop.current + here.layout.centers[i] - scrollNow.current };
    return { chapter, target, from, to, iconTo: LESSON_ICONS[path.routeItems[target].type] ?? "play" };
  };
  const openChapter = (i) => {
    if (flight.current) return finishLeaving();
    const plan = i === nextIndex && !reduce ? travelPlan(i) : null;
    if (!plan) return onSelectLesson(chapters[i]);
    flight.current = plan;
    // the tile draws itself, then starts the clock; the page switches once its last frame is on screen
    return flyer.current?.launch(plan, finishLeaving);
  };

  return (
    <Animated.View
      style={[
        styles.root,
        arriving ? { opacity: arriving, transform: [{ scale: arriving.interpolate({ inputRange: [0, 1], outputRange: [SCREEN.back.inScale, 1] }) }] } : null,
      ]}
    >
      {/* "ledge": the fox stands on the tab bar, drawn under the page so the path scrolls over her */}
      {mascotVariant === "ledge" ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, arrival?.looks.fox]}>
          <FoxFigure
            spec={LEDGE_FOX}
            k={scaleOf(screenWidth)}
            motion="sway"
            reduce={reduce}
            style={{ position: "absolute", left: LEDGE_FOX.left * scaleOf(screenWidth), bottom: NAV_BAR_HEIGHT + insets.bottom }}
          />
        </Animated.View>
      ) : null}
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrim(event);
          checkAway(event.nativeEvent.contentOffset.y, event.nativeEvent.layoutMeasurement.height);
          routeScroll.setValue(event.nativeEvent.contentOffset.y - routeTop.current);
          scrollNow.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
      >
        <DotGrid />

        <Animated.View style={[styles.header, { paddingTop: insets.top + 60 }, arrival?.looks.header]}>
          <Emblem course={course} size={48} radius={15} />
          <Animated.View style={[styles.titleBlock, exitLooks.title]}>
            <View>
              <AppText style={levelLabel}>COURSE</AppText>
              <AppText variant="title" numberOfLines={2} style={styles.title}>
                {course.title}
              </AppText>
            </View>
            {total > 0 ? (
              <ProgressBar
                value={doneCount / total}
                height={5}
                fill={stone.moss}
                track={stone.rockLight}
                intro={arrival ? ARRIVAL.bar : undefined}
                change={BAR_CHANGE}
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
          </Animated.View>
        </Animated.View>

        {total === 0 ? (
          <EmptyState title="No chapters yet" message="Chapters will appear here soon." />
        ) : (
          <View
            style={styles.route}
            onLayout={(event) => {
              routeTop.current = event.nativeEvent.layout.y;
              routeScroll.setValue(-routeTop.current);
              scrollToNow();
              checkAway(0, screenHeight);
              startArrival();
            }}
          >
            <Route
              items={items}
              mascot={mascotVariant}
              arrival={arrival}
              scrollY={routeScroll}
              viewHeight={screenHeight}
              foxKey={`course-${course.id}`}
              den={{
                reached: finished,
                title: finished ? "You reached the den" : "The den",
                caption: finished ? "Course complete" : `${total - doneCount} ${chapterWord(total - doneCount)} to go`,
              }}
              exit={exit}
              advanceLead={arriving ? SCREEN.back.lead : undefined}
              onPress={openChapter}
            />
          </View>
        )}

        {onToggleMine ? (
          <Animated.View style={exitLooks.others}>
          <Button
            variant="text"
            label={isMine ? "Remove from your courses" : "Add to your courses"}
            onPress={onToggleMine}
            style={styles.toggleMine}
          />
          </Animated.View>
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

      {/* the tab bar slides away as the page leaves for a chapter (the chapter page has none) */}
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, exitLooks.tabs]}
      >
        {/* ...and slides up into place as the page first arrives (arrival.js) */}
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, arrival?.looks.tabs]}>
        <BottomNavBar
          active="courses"
          onNavigate={(tab) => {
            if (tab === "home") onHome();
            if (tab === "courses") onCourses();
            if (tab === "ranking") onRanking();
            if (tab === "profile") onProfile();
          }}
        />
        </Animated.View>
      </Animated.View>

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

      <FlyingTile ref={flyer} clock={exitClock} onTap={finishLeaving} />
    </Animated.View>
  );
}

const LESSON_ICONS = { video: "play", reading: "document-text", questions: "help" };

// The current chapter's tile on its way to the chapter page (SCREEN.exit.tile), ring and all; on the
// way its icon turns into the lesson's. It plays no routine. While it flies, a tap anywhere finishes
// the move at once. launch(plan, onDone) draws it and then runs the page's exit clock.
const FlyingTile = forwardRef(function FlyingTile({ clock, onTap }, ref) {
  const [flight, setFlight] = useState(null); // { plan, onDone }
  useImperativeHandle(ref, () => ({ launch: (plan, onDone) => setFlight({ plan, onDone }) }), []);
  useEffect(() => {
    if (!flight) return undefined;
    let run = null;
    const frame = requestAnimationFrame(() => {
      // once it has landed the chapter page starts building; meanwhile the tile settles with a small
      // bump, so the moment that takes is part of the move rather than a pause
      const [b0, b1] = SCREEN.exit.settle;
      run = Animated.timing(clock, { toValue: SCREEN.exit.end, duration: SCREEN.exit.end, easing: Easing.linear, useNativeDriver: true });
      run.start(({ finished }) => {
        if (!finished) return;
        run = Animated.timing(clock, { toValue: b1, duration: b1 - b0, easing: Easing.linear, useNativeDriver: true });
        run.start();
        flight.onDone();
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      run?.stop();
    };
  }, [flight, clock]);
  const look = useMemo(() => {
    if (!flight) return null;
    const { from, to } = flight.plan;
    const along = (a, b) => win(clock, SCREEN.exit.tile, 0, b - a);
    return {
      box: {
        transform: [
          { translateX: along(from.x, to.x) },
          { translateY: along(from.y, to.y) },
          { scale: clock.interpolate({ inputRange: [SCREEN.exit.settle[0], (SCREEN.exit.settle[0] + SCREEN.exit.settle[1]) / 2, SCREEN.exit.settle[1]], outputRange: [1, 1.045, 1], extrapolate: "clamp" }) },
        ],
      },
      icon: { opacity: win(clock, SCREEN.exit.icon, 0, 1) },
    };
  }, [flight, clock]);
  if (!flight) return null;
  const { plan } = flight;
  const box = rockBox(84);
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} accessible={false} importantForAccessibility="no" />
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: plan.from.x - box.cx, top: plan.from.y - box.cy }, look.box]}>
        <Rock status="next" size={84} icon="play" ring wait={60000} />
        <Animated.View style={[StyleSheet.absoluteFill, look.icon]}>
          <Rock status="next" size={84} icon={plan.iconTo} ring wait={60000} />
        </Animated.View>
      </Animated.View>
    </>
  );
});

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
