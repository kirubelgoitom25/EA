import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useReducedMotion } from "./motion";

// The progress ring around a course's icon: a rounded square (78 dp wide, 24 dp corners, 6 dp stroke)
// in an 84 dp box, like the ring around the current chapter button. The progress starts at the top
// middle and runs clockwise. It draws from empty to `progress` (0..1) over 1 s after 0.2 s, ease-out,
// when the row first appears, and just shows (no drawing) with Reduce Motion.
const SIZE = 84;
const RING = "M42 3H57A24 24 0 0 1 81 27V57A24 24 0 0 1 57 81H27A24 24 0 0 1 3 57V27A24 24 0 0 1 27 3Z";
export const RING_LENGTH = 4 * 30 + 2 * Math.PI * 24; // four straight sides + four quarter corners
const TRACK = "#E6EEE9";
const FILL = "#5E9C7D";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function CourseRing({ progress = 0, style }) {
  const value = Math.max(0, Math.min(1, Number(progress) || 0));
  const reduceMotion = useReducedMotion();
  // how much of the ring is still undrawn (a dash offset), so 0 shows nothing and RING_LENGTH shows it all
  const hidden = useRef(new Animated.Value(reduceMotion ? RING_LENGTH * (1 - value) : RING_LENGTH)).current;
  const first = useRef(true);

  useEffect(() => {
    const target = RING_LENGTH * (1 - value);
    if (reduceMotion) {
      hidden.setValue(target);
      first.current = false;
      return undefined;
    }
    const animation = Animated.timing(hidden, {
      toValue: target,
      delay: first.current ? 200 : 0,
      duration: first.current ? 1000 : 250,
      easing: Easing.bezier(0, 0, 0.58, 1), // CSS ease-out
      useNativeDriver: false,
    });
    first.current = false;
    animation.start();
    return () => animation.stop();
  }, [value, reduceMotion, hidden]);

  const complete = value >= 1;
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={style} pointerEvents="none">
      <Path d={RING} fill="none" stroke={complete ? FILL : TRACK} strokeWidth={6} />
      {complete ? null : (
        <AnimatedPath
          d={RING}
          fill="none"
          stroke={FILL}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={[RING_LENGTH, RING_LENGTH]}
          strokeDashoffset={hidden}
        />
      )}
    </Svg>
  );
}
