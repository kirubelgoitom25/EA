import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

// The setting as last read. The phone answers asynchronously, so this is read when the app starts:
// a screen opened later knows on its first render and never starts something it must not play.
let lastKnown = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => {
    lastKnown = enabled;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
  lastKnown = enabled;
});

// True when the student has asked the phone to reduce motion. Animated
// components should then jump straight to their end state.
export function useReducedMotion() {
  const [reduceMotion, setReduceMotion] = useState(lastKnown);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

// The polish pass's motion vocabulary (durations in ms). With Reduce Motion on, callers skip the
// movement and fade for FADE ms instead (or jump straight to the end).
export const MOTION = {
  press: 80,
  pop: 450,
  shake: 400,
  rise: 500,
  screen: 460,
  exit: 260,
  fill: 600,
  fade: 150,
};

export const CURVE = {
  press: Easing.ease,
  pop: Easing.bezier(0.3, 1.6, 0.5, 1), // overshoots, then settles
  rise: Easing.bezier(0.3, 1.5, 0.5, 1),
  screen: Easing.bezier(0.2, 0.9, 0.3, 1), // fast out, soft landing
  exit: Easing.in(Easing.ease),
  fill: Easing.bezier(0.3, 1.5, 0.5, 1),
};

// A pop: 0 → 1 with a little overshoot past 1. Use as Animated.timing config.
export const popTiming = (value, { toValue = 1, delay = 0, duration = MOTION.pop } = {}) =>
  Animated.timing(value, { toValue, delay, duration, easing: CURVE.pop, useNativeDriver: true });

// A wrong-answer shake: runs `value` (translateX, dp) out and back in 400 ms.
export const shakeTiming = (value) => {
  const step = (toValue, duration) => Animated.timing(value, { toValue, duration, easing: Easing.ease, useNativeDriver: true });
  return Animated.sequence([step(-9, 60), step(9, 80), step(-7, 70), step(6, 70), step(-3, 60), step(0, 60)]);
};

// The setting as last read, for code outside a component (a press handler, a timing helper).
export const reduceMotionNow = () => lastKnown;
