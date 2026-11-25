import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { edge, fonts, layout, space, tokens, ui } from "../theme";
import BottomNavBar from "./BottomNavBar";
import { firstOpenChapter, flattenChapters } from "./session/sessionModel";
import AppText from "./ui/AppText";
import { Entrance } from "./ui/anim";
import ChapterBanner from "./ui/ChapterBanner";
import { bannerIndex, openScroll } from "./ui/chapterBannerModel";
import EmptyState from "./ui/EmptyState";
import PressLip from "./ui/PressLip";
import StatChips from "./ui/StatChips";
import { useFoxReact } from "./ui/FoxContext";
import { PATH_PEEK } from "./ui/FoxPeek";
import { PATH_TILE, ringTop } from "./ui/Rock";
import Screen, { TAB_BAR_HEIGHT } from "./ui/Screen";
import Route, { routeMetrics } from "./ui/Route";
import { PathSkeleton } from "./ui/Skeleton";
import { TabScene } from "./ui/tabMotion";

// How many chapters of the trail Home shows around where you are.
const WINDOW = 5;

// The fixed header: the top bar, then the chapter banner 18 dp under it. The path scrolls beneath both.
const TOP_BAR = 48; // the course pill and its edge
const BANNER_GAP = 18;
const BANNER_BOX = 96 + 6; // the banner and its bottom edge
const PATH_GAP = 4; // the path starts this far under the banner (its first tile 18 dp under, as in the mock)
// Where Home opens: the current tile under the banner, the fox's head on it in full, 18 dp of white above.
const FOX_TOP = ringTop(PATH_TILE) + PATH_PEEK.tuck - PATH_PEEK.height; // tile centre to the top of her head
const OPEN_ROOM = 18;

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
  const { width, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const foxReact = useFoxReact();
  useEffect(() => {
    foxReact("open");
  }, [foxReact]);

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

  const showTrail = chapters.length > 0;

  // The trail's keys, also measured for the banner (same options as the <Route> below).
  const items = visible.map((chapter, i) => {
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
  });
  const centers = showTrail ? routeMetrics(items, false, true, true, "course", width).centers : [];
  // open on the chapter you're at (the last one once the course is done)
  const openAt = resumeChapter ? nextIndex - start : visible.length - 1;
  const openY = showTrail ? openScroll(centers, openAt, PATH_GAP, FOX_TOP, OPEN_ROOM) : 0;

  // the fixed header's height, measured (with and without the banner); a close guess until then
  const [headerHeights, setHeaderHeights] = useState({});
  const headerHeight = headerHeights[showTrail] ?? space.xl + TOP_BAR + (showTrail ? BANNER_GAP + BANNER_BOX : 0);
  const [viewHeight, setViewHeight] = useState(windowHeight - insets.top);
  const scroll = useRef(null);
  const placedFor = useRef(null); // the trail Home last opened on
  const placeKey = showTrail ? `${trailCourse.id}:${resumeChapter?.id ?? "end"}` : null;
  const firstOffset = useRef(null);
  if (firstOffset.current === null && showTrail) firstOffset.current = { x: 0, y: openY };
  const setBanner = useRef(null); // the banner's own setter, so scrolling never re-renders the path
  const bannerAt = useRef(0);

  const chapterAt = (i) => ({ key: visible[i].id, number: start + i + 1, title: visible[i].title, chapter: visible[i] });

  return (
    <View style={styles.root}>
      <TabScene tab="home">
      <Screen
        withTabBar
        background={ui.screen}
        scrollRef={scroll}
        scrollProps={{
          contentOffset: firstOffset.current ?? undefined,
          scrollEventThrottle: 16,
          onLayout: (event) => setViewHeight(Math.round(event.nativeEvent.layout.height)),
          onContentSizeChange: () => {
            if (!placeKey || placedFor.current === placeKey) return;
            placedFor.current = placeKey;
            scroll.current?.scrollTo({ x: 0, y: openY, animated: false });
          },
          onScroll: (event) => {
            if (!showTrail) return;
            const i = bannerIndex(centers, event.nativeEvent.contentOffset.y, PATH_GAP);
            if (i === bannerAt.current) return;
            bannerAt.current = i;
            setBanner.current?.(i);
          },
        }}
        contentStyle={[
          styles.content,
          { paddingTop: headerHeight + (showTrail ? PATH_GAP : 0) },
          showTrail && {
            paddingBottom: TAB_BAR_HEIGHT + insets.bottom + space.xxl,
            // room to open with the current chapter at the top, however short the trail
            minHeight: openY + viewHeight,
          },
        ]}
      >
        {showTrail ? (
          <Route
            cta={false}
            words={false}
            foxPlace="above"
            zigzag
            foxKey={`course-${trailCourse.id}`}
            scenery
            items={items}
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

      {/* fixed: solid white behind the top bar and the banner, so the path never shows through */}
      <View
        style={[styles.header, { top: insets.top }]}
        onLayout={(event) => {
          const h = Math.round(event.nativeEvent.layout.height);
          setHeaderHeights((now) => (now[showTrail] === h ? now : { ...now, [showTrail]: h }));
        }}
      >
        <Entrance distance={-14} style={[styles.top, styles.topBar]}>
          {showTrail ? (
            <PressLip
              onPress={() => (courses.length > 1 ? onCourses() : onSelectCourse(trailCourse))}
              accessibilityLabel={`${trailCourse.title}. ${courses.length > 1 ? "Switch course" : "Open course"}`}
              lip={ui.surfaceEdge}
              lipSize={edge.topButton.depth}
              radius={edge.topButton.radius}
              border
              haptics
              style={styles.coursePillBox}
              faceStyle={styles.coursePill}
            >
              <AppText variant="label" numberOfLines={1} style={styles.courseName}>
                {trailCourse.title}
              </AppText>
              <Ionicons name="chevron-down" size={18} color={tokens.text} />
            </PressLip>
          ) : (
            <View />
          )}

          <View style={styles.topRight}>
            <StatChips user={user} ranking={ranking} onRanking={onRanking} />
            {availableCount > 0 ? (
              <PressLip
                onPress={onExplore}
                hitSlop={space.sm}
                accessibilityLabel="Explore courses"
                lip={ui.primaryEdge}
                lipSize={edge.stat.depth}
                radius={edge.stat.radius}
                haptics
                faceStyle={styles.add}
              >
                <Ionicons name="add" size={22} color={tokens.onAccentStrong} />
              </PressLip>
            ) : null}
          </View>
        </Entrance>

        {showTrail ? (
          <View style={styles.banner}>
            <TrackedBanner
              key={trailCourse.id}
              course={trailCourse.title}
              total={chapters.length}
              first={bannerIndex(centers, openY, PATH_GAP)}
              count={visible.length}
              chapterAt={chapterAt}
              progress={chapters.length ? chapters.filter((c) => c.completed).length / chapters.length : 0}
              register={(set, first) => {
                setBanner.current = set;
                bannerAt.current = first;
              }}
              onOpen={(target) => onContinueChapter(trailCourse, target.chapter)}
            />
          </View>
        ) : null}
      </View>
      </TabScene>

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

// The banner keeps which chapter it names to itself: scrolling sets it through register's setter, so
// only the banner re-renders, never the path.
function TrackedBanner({ course, total, first, count, chapterAt, progress, register, onOpen }) {
  const [at, setAt] = useState(first);
  const registered = useRef(false);
  if (!registered.current) {
    registered.current = true;
    register(setAt, first);
  }
  const i = Math.min(Math.max(at, 0), count - 1);
  return <ChapterBanner course={course} total={total} chapter={chapterAt(i)} progress={progress} onOpen={onOpen} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.screen, // what shows while one tab fades into another
  },

  content: {
    paddingTop: space.xl,
  },

  header: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingTop: space.xl,
    backgroundColor: ui.screen,
  },

  topBar: {
    paddingHorizontal: layout.gutter,
  },

  banner: {
    marginTop: BANNER_GAP,
    marginHorizontal: 16,
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
    gap: 8,
  },

  stat: {
    height: 36,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  statValue: {
    fontFamily: fonts.display,
    fontSize: 14,
    lineHeight: 18,
  },

  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },

  add: {
    width: 36,
    height: 36,
    backgroundColor: ui.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  // the course picker: a white key on a 4 dp edge
  coursePillBox: {
    flexShrink: 1,
  },

  coursePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 44,
    paddingLeft: space.md,
    paddingRight: space.sm,
    backgroundColor: ui.surface,
  },

  courseName: {
    flexShrink: 1,
    fontFamily: fonts.display,
  },

  trail: {
    marginTop: space.xl,
  },
});
