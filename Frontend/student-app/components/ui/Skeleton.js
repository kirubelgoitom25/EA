import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout, level, space } from "../../theme";
import { useReducedMotion } from "./motion";

// While a screen loads, it shows its own layout as soft grey shapes instead of a spinner: tiles,
// title bars, cards, where the real ones will be. The shapes fade gently between 60% and 100% every
// 1.2 s (still with reduce motion). They take no touches and screen readers hear "Loading".
//
// - Pulse: any content fading at that rhythm (also used for a saving button's label)
// - Bone: one grey shape
// - PathSkeleton, HomeSkeleton, QuestionSkeleton, RowsSkeleton, VideoSkeleton: whole layouts
export const BONE = "#E8EDEA";
const CYCLE = 1200;

export function usePulse(active = true) {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || reduce) {
      opacity.setValue(1);
      return undefined;
    }
    const half = { duration: CYCLE / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true };
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, ...half }),
        Animated.timing(opacity, { toValue: 1, ...half }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduce, opacity]);
  return opacity;
}

export function Pulse({ active = true, style, children, label = "Loading" }) {
  const opacity = usePulse(active);
  return (
    <Animated.View
      pointerEvents="none"
      accessible={!!label}
      accessibilityLabel={label || undefined}
      accessibilityRole={label ? "progressbar" : undefined}
      style={[style, { opacity }]}
    >
      {children}
    </Animated.View>
  );
}

export function Bone({ width, height, radius = 8, style }) {
  return <View style={[{ width, height, borderRadius: radius, backgroundColor: BONE }, style]} />;
}

// The path of tiles (Home, a course, a chapter): 84 dp keys, odd ones left and even ones right like
// the real zigzag, each with a short bar of words on its other side.
export function PathSkeleton({ count = 4, words = true, style }) {
  const { width } = useWindowDimensions();
  const k = width / 390;
  const gap = 136;
  return (
    <Pulse style={[{ height: count * gap }, style]}>
      {Array.from({ length: count }, (_, i) => {
        const left = i % 2 === 0;
        const cx = (left ? 96 : 284) * k;
        const top = i * gap;
        return (
          <React.Fragment key={i}>
            <Bone width={84} height={90} radius={26} style={{ position: "absolute", left: cx - 42, top }} />
            {words ? (
              <Bone
                width={88}
                height={14}
                radius={7}
                style={{ position: "absolute", top: top + 36, ...(left ? { left: cx + 72 } : { left: cx - 72 - 88 }) }}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </Pulse>
  );
}

// Home before its data: the course pill and the three numbers, then the trail.
export function HomeSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, { paddingTop: insets.top + space.lg + 10 }]}>
      <Pulse style={styles.homeTop}>
        <Bone width={150} height={40} radius={20} />
        <View style={styles.row}>
          <Bone width={44} height={24} />
          <Bone width={56} height={24} />
          <Bone width={36} height={24} />
        </View>
      </Pulse>
      <PathSkeleton count={5} words={false} style={styles.homePath} />
    </View>
  );
}

// A question while its stage loads: the stage words, the sentence, four answer cards.
export function QuestionSkeleton() {
  return (
    <Pulse style={styles.question}>
      <Bone width={210} height={12} radius={6} />
      <Bone width="92%" height={26} style={styles.gapMd} />
      <Bone width="60%" height={26} style={styles.gapSm} />
      <View style={styles.cards}>
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} height={92} radius={level.cardRadius} style={styles.card} />
        ))}
      </View>
    </Pulse>
  );
}

// A list of cards (requests and the like).
export function RowsSkeleton({ count = 3, height = 104 }) {
  return (
    <Pulse style={styles.rows}>
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} width="100%" height={height} radius={16} />
      ))}
    </Pulse>
  );
}

// The video's frame, before the player is ready.
export function VideoSkeleton({ style }) {
  return (
    <Pulse style={[StyleSheet.absoluteFill, style]} label="Loading video">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BONE }]} />
    </Pulse>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#FFFFFF" },
  row: { flexDirection: "row", gap: space.lg, alignItems: "center" },
  homeTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: layout.gutter,
  },
  homePath: { marginTop: 38 },
  question: {},
  gapMd: { marginTop: space.lg },
  gapSm: { marginTop: space.sm },
  cards: { marginTop: space.xxl, flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { flexBasis: "47%", flexGrow: 1 },
  rows: { gap: space.md, marginTop: space.lg },
});

// Pull-to-refresh without its spinning circle: the gesture still works, the circle is invisible and
// pushed out of sight, and the screen's content pulses instead (Screen's `pulsing`). Spread onto a
// <RefreshControl>.
export const QUIET_REFRESH = {
  colors: ["transparent"],
  progressBackgroundColor: "transparent",
  tintColor: "transparent",
  progressViewOffset: -200,
};
