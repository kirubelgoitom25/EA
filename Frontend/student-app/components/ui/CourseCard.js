import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import { accessLine, isLocked } from "../../services/access";
import { fonts, ui } from "../../theme";
import { courseProgress } from "../coursesModel";
import AppText from "./AppText";
import CourseIcon from "./CourseIcon";
import CourseRing from "./CourseRing";
import { CURVE } from "./motion";
import PressLip from "./PressLip";
import ProgressBar from "./ProgressBar";

// A course on the Courses tab (handoff part 3). A started course is the larger card with a green
// edge, "2 of 4 chapters" and a progress bar; a finished one is a white card with a grey edge, a full
// ring, a check badge and "Completed"; one not started looks like a finished card without the badge,
// saying "Not started". Every card sinks when pressed. A course not paid for keeps its access line and
// a lock where the chevron would be.
// onPress(course, centre): centre is the card's middle on screen, where the course page dives in from.
// fillAt: { delay } fills the bar from empty (the screen's first open); otherwise it just shows.
export default function CourseCard({ course, onPress, fillAt }) {
  const { total, done, value, state } = courseProgress(course);
  const locked = isLocked(course);
  const big = state === "started";
  const count = `${done} of ${total} ${total === 1 ? "chapter" : "chapters"}`;
  const sub = locked ? accessLine(course) : state === "done" ? "Completed" : state === "new" ? "Not started" : count;
  const box = useRef(null);

  const press = () => {
    if (!box.current) return onPress(course);
    box.current.measureInWindow((x, y, width, height) => onPress(course, { x: x + width / 2, y: y + height / 2 }));
  };

  const ring = big ? RING_BIG : RING_SMALL;
  return (
    <View ref={box} collapsable={false}>
      <PressLip
        onPress={press}
        accessibilityLabel={`${course.title}, ${locked ? accessLine(course) : state === "done" ? "completed" : state === "new" ? "not started" : `${done} of ${total} chapters`}`}
        lip={big ? ui.primary : ui.surfaceEdge}
        lipSize={big ? 5 : 4}
        radius={big ? 20 : 18}
        border
        haptics
        faceStyle={[styles.face, big ? styles.faceBig : styles.faceSmall]}
      >
        <View style={{ width: ring.size, height: ring.size }}>
          <CourseRing progress={locked ? 0 : value} size={ring.size} stroke={5} />
          <CourseIcon course={course} size={ring.icon} radius={ring.radius} style={[styles.icon, { left: (ring.size - ring.icon) / 2, top: (ring.size - ring.icon) / 2 }]} />
          {state === "done" && !locked ? (
            <View style={styles.badge} importantForAccessibility="no-hide-descendants">
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Path d="M20 6 9 17l-5-5" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          ) : null}
        </View>

        <View style={styles.words}>
          <AppText numberOfLines={2} style={big ? styles.nameBig : styles.name}>
            {course.title}
          </AppText>
          <AppText numberOfLines={1} style={[styles.sub, state === "done" && !locked && styles.subDone]}>
            {sub}
          </AppText>
          {big ? (
            <ProgressBar
              value={locked ? 0 : value}
              height={12}
              radius={7}
              fill={ui.fill}
              track={ui.track}
              stripe={{ color: ui.fillTop, height: 4 }}
              inset={{ color: ui.trackInset, height: 2 }}
              intro={fillAt ? { delay: fillAt.delay, duration: 800 } : undefined}
              curve={CURVE.fill}
              style={styles.bar}
            />
          ) : null}
        </View>

        <View style={styles.chevron} importantForAccessibility="no-hide-descendants">
          {locked ? (
            <Ionicons name="lock-closed" size={18} color={ui.textMuted} />
          ) : (
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="m9 6 6 6-6 6" stroke={big ? ui.primary : ui.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
      </PressLip>
    </View>
  );
}

// the icon at 64 (started) or 56 dp with its ring, the tile inside it
const RING_BIG = { size: 64, icon: 50, radius: 14 };
const RING_SMALL = { size: 56, icon: 42, radius: 12 };

const styles = StyleSheet.create({
  face: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: ui.surface,
  },

  faceBig: {
    padding: 14,
  },

  faceSmall: {
    padding: 12,
  },

  icon: {
    position: "absolute",
  },

  badge: {
    position: "absolute",
    left: 34,
    top: 34,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: ui.surface,
    backgroundColor: ui.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  words: {
    flex: 1,
  },

  nameBig: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: ui.ink,
  },

  name: {
    fontFamily: fonts.display,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.2,
    color: ui.ink,
  },

  sub: {
    marginTop: 2,
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: ui.textSecondary,
  },

  subDone: {
    color: ui.done.ink,
  },

  bar: {
    marginTop: 10,
  },

  chevron: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
