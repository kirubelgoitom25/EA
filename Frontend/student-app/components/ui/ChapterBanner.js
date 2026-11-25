import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { edge, fonts, ui } from "../../theme";
import { CURVE, MOTION, useReducedMotion } from "./motion";
import PressLip from "./PressLip";
import ProgressBar from "./ProgressBar";

export const BANNER_HEIGHT = 96;
export const BANNER_LIP = edge.banner.depth;

const FACE = ui.primary;
const LIP = ui.primaryEdge;
const KICKER = ui.bannerKicker;
const BUTTON_FACE = "#5D8972"; // white at 16% over the banner, made solid so its edge can show
const SHIFT = 10; // dp the words travel on a swap
const HALF = 180; // ms out, then ms in
const EASE = Easing.bezier(0.4, 0, 0.2, 1);

// Home's chapter banner: the course, which chapter of how many, its name, a 10 dp bar of the course's
// progress (progress 0..1, filling with the fill motion), and a button to the chapter's lessons.
// chapter: { key, number, title }. When the chapter changes the words slide up and out, then the new
// ones slide in from below; the banner itself stays put. While a swap runs, further changes only move
// where it lands, so a fast scroll never flickers through every chapter. Reduce motion: instant.
export default function ChapterBanner({ course, total, chapter, progress = 0, onOpen }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(chapter);
  const shownRef = useRef(chapter); // what is on screen (or about to be), for the swap's own checks
  const latest = useRef(chapter); // where the banner should land
  latest.current = chapter;
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const busy = useRef(false);
  const comingIn = useRef(false);
  const running = useRef(null);
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const show = (next) => {
    shownRef.current = next;
    setShown(next);
  };

  const play = (to, after) => {
    const run = Animated.parallel([
      Animated.timing(y, { toValue: to.y, duration: HALF, easing: EASE, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: to.opacity, duration: HALF, easing: EASE, useNativeDriver: true }),
    ]);
    running.current = run;
    run.start(({ finished }) => finished && after());
  };

  // Start a swap to wherever the banner should be now, unless one is running (that one catches up).
  const swap = () => {
    if (busy.current) return;
    const next = latest.current;
    if (next.key === shownRef.current.key) {
      // same chapter, newer words (a refresh): no motion
      if (next.title !== shownRef.current.title || next.number !== shownRef.current.number) show(next);
      return;
    }
    if (reduceRef.current) {
      show(next);
      return;
    }
    busy.current = true;
    play({ y: -SHIFT, opacity: 0 }, () => {
      y.setValue(SHIFT);
      comingIn.current = true;
      show(latest.current);
    });
  };
  const swapRef = useRef(swap);
  swapRef.current = swap;

  useEffect(() => {
    swapRef.current();
  }, [chapter]);

  // the new words are on screen (invisible, 10 dp low): bring them in, then catch up if it moved on
  useEffect(() => {
    if (!comingIn.current) return;
    comingIn.current = false;
    play({ y: 0, opacity: 1 }, () => {
      busy.current = false;
      swapRef.current();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // reduce motion turned on mid-swap: finish it at once
  useEffect(() => {
    if (!reduce || !busy.current) return;
    running.current?.stop();
    busy.current = false;
    comingIn.current = false;
    y.setValue(0);
    opacity.setValue(1);
    show(latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  useEffect(() => () => running.current?.stop(), []);

  return (
    <View style={styles.lip}>
      <View style={styles.face}>
        <Animated.View
          accessible
          accessibilityLabel={`${course}, chapter ${shown.number} of ${total}: ${shown.title}`}
          style={[styles.words, { opacity, transform: [{ translateY: y }] }]}
        >
          <View style={styles.kickerRow}>
            <Text numberOfLines={1} style={[styles.kicker, styles.course]}>
              {course.toUpperCase()}
            </Text>
            <Text numberOfLines={1} style={styles.kicker}>
              {` · CHAPTER ${shown.number} OF ${total}`}
            </Text>
          </View>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.name}>
            {shown.title}
          </Text>
        </Animated.View>
        <ProgressBar
          value={progress}
          height={10}
          radius={6}
          track={LIP}
          fill={ui.bannerFill}
          stripe={{ color: ui.bannerFillTop, height: 3 }}
          change={{ duration: MOTION.fill }}
          curve={CURVE.fill}
          style={styles.bar}
          accessibilityLabel={`Course ${Math.round(progress * 100)} percent done`}
        />
        <PressLip
          onPress={() => onOpen(latest.current)}
          accessibilityLabel={`Open chapter ${chapter.number} lessons`}
          lip={LIP}
          lipSize={4}
          radius={14}
          style={styles.list}
          faceStyle={styles.listFace}
        >
          <Ionicons name="list" size={24} color="#FFFFFF" />
        </PressLip>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // the solid 5 dp bottom edge: the banner's shape in the darker green, showing below the face
  lip: {
    height: BANNER_HEIGHT + BANNER_LIP,
    borderRadius: edge.banner.radius,
    backgroundColor: LIP,
  },

  face: {
    height: BANNER_HEIGHT,
    borderRadius: edge.banner.radius,
    backgroundColor: FACE,
  },

  words: {
    position: "absolute",
    left: 16,
    top: 14,
    right: 76,
  },

  kickerRow: {
    flexDirection: "row",
  },

  kicker: {
    fontFamily: fonts.display,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    color: KICKER,
  },

  course: {
    flexShrink: 1,
  },

  name: {
    marginTop: 4,
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },

  bar: {
    position: "absolute",
    left: 16,
    right: 76,
    bottom: 16,
  },

  list: {
    position: "absolute",
    right: 14,
    top: 22,
  },

  listFace: {
    width: 46,
    height: 46,
    backgroundColor: BUTTON_FACE,
    alignItems: "center",
    justifyContent: "center",
  },
});
