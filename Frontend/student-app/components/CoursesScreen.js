import React, { useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, SvgXml } from "react-native-svg";

import { fonts, space, ui } from "../theme";
import BottomNavBar from "./BottomNavBar";
import { groupCourses } from "./coursesModel";
import Rise from "./session/Rise";
import AppText from "./ui/AppText";
import CourseCard from "./ui/CourseCard";
import { diveFrom } from "./ui/DiveIn";
import EmptyState from "./ui/EmptyState";
import PressLip from "./ui/PressLip";
import { COURSES_FOOTER_ART } from "./ui/sceneryArt";
import Screen, { TAB_BAR_HEIGHT } from "./ui/Screen";
import { RowsSkeleton } from "./ui/Skeleton";
import { firstVisit, TabScene } from "./ui/tabMotion";

const TITLE_TOP = 58; // from the top of the screen: clear of the status bar with room to spare
const RISE_STEP = 80;
const RISE_MS = 380; // Rise's own duration
const STAGGERED = 8; // pieces further down come in with the eighth

// The Courses tab: the courses the student added, in sections: CONTINUE LEARNING (started, the one
// opened last first), COMPLETED and NOT STARTED. Finding more is on the Explore page (the + at the
// top right). Scenery sits above the nav bar, behind the list.
export default function CoursesScreen({
  courses = [],
  myCourseIds = [],
  openedAt = {}, // when each course was last opened (ms), for the order of started courses
  loading = false, // "Your courses" is still being read from the phone
  onExplore,
  onSelectCourse,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const insets = useSafeAreaInsets();
  const [play] = useState(() => firstVisit("courses"));
  const mine = useMemo(() => courses.filter((course) => myCourseIds.includes(course.id)), [courses, myCourseIds]);
  const sections = useMemo(() => groupCourses(mine, openedAt), [mine, openedAt]);

  const open = (course, centre) => {
    diveFrom(course.id, centre);
    onSelectCourse(course);
  };

  // every eyebrow and card rises in turn; the bars fill once the last card is up
  let order = 0;
  const next = () => Math.min(order++, STAGGERED);
  const pieces = sections.map((section) => ({
    ...section,
    eyebrowOrder: next(),
    cardOrders: section.courses.map(() => next()),
  }));
  const fillDelay = Math.min(order, STAGGERED + 1) * RISE_STEP + RISE_MS;

  return (
    <View style={styles.root}>
      <TabScene tab="courses">
        <Screen
          withTabBar
          background={ui.screen}
          backdrop={<Footer bottom={TAB_BAR_HEIGHT + insets.bottom} />}
          contentStyle={[styles.content, { paddingTop: Math.max(space.md, TITLE_TOP - insets.top) }]}
        >
          <View style={styles.header}>
            <AppText accessibilityRole="header" style={styles.title}>
              Courses
            </AppText>
            {courses.length > 0 ? (
              <PressLip
                onPress={onExplore}
                hitSlop={space.sm}
                accessibilityLabel="Explore courses"
                lip={ui.pill.edge}
                lipSize={4}
                radius={14}
                haptics
                faceStyle={styles.addFace}
              >
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <Path d="M12 5v14M5 12h14" stroke={ui.primary} strokeWidth={2.75} strokeLinecap="round" />
                </Svg>
              </PressLip>
            ) : null}
          </View>

          {courses.length === 0 ? (
            <EmptyState title="No courses yet" message="New courses will show up here soon." />
          ) : loading ? (
            <View style={styles.skeleton}>
              <RowsSkeleton count={2} height={88} />
            </View>
          ) : mine.length === 0 ? (
            <AppText style={styles.hint}>Tap + to find your first course.</AppText>
          ) : (
            pieces.map((section) => (
              <View key={section.key}>
                <Rise order={section.eyebrowOrder} distance={22} step={RISE_STEP} play={play}>
                  <AppText style={styles.eyebrow} accessibilityRole="header">
                    {section.title}
                  </AppText>
                </Rise>
                <View style={styles.cards}>
                  {section.courses.map((course, i) => (
                    <Rise key={course.id} order={section.cardOrders[i]} distance={22} step={RISE_STEP} play={play}>
                      <CourseCard course={course} onPress={open} fillAt={play ? { delay: fillDelay } : undefined} />
                    </Rise>
                  ))}
                </View>
              </View>
            ))
          )}
        </Screen>
      </TabScene>

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

// The supplied scenery, full width, pinned directly above the nav bar; the list scrolls over it.
function Footer({ bottom }) {
  const { width } = useWindowDimensions();
  const height = Math.round((COURSES_FOOTER_ART.height * width) / COURSES_FOOTER_ART.width);
  return (
    <View pointerEvents="none" style={[styles.footer, { bottom, height }]}>
      <SvgXml xml={COURSES_FOOTER_ART.xml} width={width} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.screen, // what shows while one tab fades into another
  },

  // cards 16 from the screen edges, text 20
  content: {
    paddingHorizontal: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },

  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    color: ui.ink,
  },

  addFace: {
    width: 48,
    height: 46,
    backgroundColor: ui.pill.bg,
    alignItems: "center",
    justifyContent: "center",
  },

  eyebrow: {
    marginTop: 26,
    marginBottom: 8,
    marginHorizontal: 4,
    fontFamily: fonts.display,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    color: ui.primary,
  },

  cards: {
    gap: 12,
  },

  skeleton: {
    marginTop: 26,
  },

  hint: {
    marginTop: 26,
    marginHorizontal: 4,
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: ui.textMuted,
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
