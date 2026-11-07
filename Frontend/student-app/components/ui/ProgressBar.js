import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { motion, TAIL, tokens } from "../../theme";
import { useReducedMotion } from "./motion";

// Progress in EA is always the Tail: the fox's orange-to-magenta gradient.
// value is 0..1; the fill eases to its new width (instantly with Reduce
// Motion). onPlum = the darker track used on the plum card. fill / track: plain colours instead of
// the Tail and the usual track (the neutral path screens use moss on stone). intro: { delay, duration }
// to fill from empty when the bar first appears.
export default function ProgressBar({
  value = 0,
  height = 8,
  onPlum = false,
  fill,
  track,
  intro,
  style,
  accessibilityLabel,
}) {
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  const reduceMotion = useReducedMotion();
  const width = useRef(new Animated.Value(intro ? 0 : clamped)).current;
  const firstFill = useRef(intro);

  useEffect(() => {
    const { delay = 0, duration = motion.base } = firstFill.current ?? {};
    firstFill.current = null;
    if (reduceMotion) {
      width.setValue(clamped);
      return undefined;
    }
    const animation = Animated.timing(width, {
      toValue: clamped,
      delay,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [clamped, reduceMotion, width]);

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: track ?? (onPlum ? tokens.plumTrack : tokens.neutralTint) },
        style,
      ]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View
        style={{
          height: "100%",
          borderRadius: height / 2,
          overflow: "hidden",
          width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      >
        {fill ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        ) : (
          <LinearGradient colors={TAIL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden",
  },
});
