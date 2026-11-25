import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";

import { CURVE, useReducedMotion } from "../ui/motion";

// Rises 18 dp and fades in when it first appears, `order` × 55 ms after the first piece (the pieces of
// a question come in one after another). Reduce Motion: no animation.
// Optional: distance (dp), step (ms between pieces), delay (ms before the first), play = false shows
// it at once (a screen opened again in the same session).
export default function Rise({ order = 0, distance = 18, step = 55, delay = 0, play = true, style, children }) {
  const reduce = useReducedMotion();
  const still = reduce || !play;
  const v = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      v.setValue(1);
      return undefined;
    }
    const run = Animated.timing(v, { toValue: 1, delay: delay + order * step, duration: 380, easing: CURVE.screen, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [still, order, step, delay, v]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}
