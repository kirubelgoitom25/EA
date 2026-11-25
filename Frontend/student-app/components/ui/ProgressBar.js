import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { motion, TAIL, tokens } from "../../theme";
import { useReducedMotion } from "./motion";

// Progress in EA is always the Tail: the fox's orange-to-magenta gradient.
// value is 0..1; the fill eases to its new width (instantly with Reduce
// Motion). onPlum = the darker track used on the plum card. fill / track: plain colours instead of
// the Tail and the usual track (the neutral path screens use moss on stone). intro: { delay, duration }
// to fill from empty when the bar first appears. change: { delay, duration } for later changes (a path's
// advance fills its bar in step with the line). stripe: { color, height } a lighter band along the
// fill's top; inset: { color, height } a darker band along the inside top of the track; radius: corners
// (default half the height); curve: the fill's easing (default ease-out).
export default function ProgressBar({
  value = 0,
  height = 8,
  onPlum = false,
  fill,
  track,
  intro,
  change,
  stripe,
  inset,
  radius,
  curve,
  style,
  accessibilityLabel,
}) {
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  const reduceMotion = useReducedMotion();
  const width = useRef(new Animated.Value(intro ? 0 : clamped)).current;
  const firstFill = useRef(intro);

  useEffect(() => {
    const { delay = 0, duration = motion.base } = firstFill.current ?? change ?? {};
    firstFill.current = null;
    if (reduceMotion) {
      width.setValue(clamped);
      return undefined;
    }
    const animation = Animated.timing(width, {
      toValue: clamped,
      delay,
      duration,
      easing: curve ?? Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [clamped, reduceMotion, width]);

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: radius ?? height / 2, backgroundColor: track ?? (onPlum ? tokens.plumTrack : tokens.neutralTint) },
        style,
      ]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      {inset ? <View pointerEvents="none" style={[styles.band, { height: inset.height, backgroundColor: inset.color }]} /> : null}
      <Animated.View
        style={{
          height: "100%",
          borderRadius: radius ?? height / 2,
          overflow: "hidden",
          width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      >
        {fill ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        ) : (
          <LinearGradient colors={TAIL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        )}
        {stripe ? <View pointerEvents="none" style={[styles.band, styles.stripe, { height: stripe.height, backgroundColor: stripe.color }]} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden",
  },

  band: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },

  stripe: {
    left: 4,
    right: 4,
    top: 2,
    borderRadius: 3,
  },
});
