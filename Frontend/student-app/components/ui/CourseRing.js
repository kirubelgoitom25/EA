import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useReducedMotion } from "./motion";

// The progress ring around a course's icon: a rounded square (78 dp wide, 24 dp corners, 6 dp stroke)
// in an 84 dp box, like the ring around the current chapter button. The progress starts at the top
// middle and runs clockwise. It draws from empty to `progress` (0..1) over 1 s after 0.2 s, ease-out,
// when the row first appears, and just shows (no drawing) with Reduce Motion.
// size / stroke: a smaller ring (the Courses cards use 64 and 56 with a 5 dp stroke); the corners keep
// the 84 dp ring's proportion.

// The ring's outline for a box of `size` with a stroke of `stroke`, starting at the top middle.
function ringPath(size, stroke) {
  const i = stroke / 2;
  const r = Math.round((24 * size) / 84);
  const m = size / 2;
  const e = size - i;
  return {
    d: `M${m} ${i}H${e - r}A${r} ${r} 0 0 1 ${e} ${i + r}V${e - r}A${r} ${r} 0 0 1 ${e - r} ${e}H${i + r}A${r} ${r} 0 0 1 ${i} ${e - r}V${i + r}A${r} ${r} 0 0 1 ${i + r} ${i}Z`,
    length: 4 * (size - stroke - 2 * r) + 2 * Math.PI * r, // four straight sides + four quarter corners
  };
}
const TRACK = "#E6EEE9";
const FILL = "#5E9C7D";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function CourseRing({ progress = 0, size = 84, stroke = 6, style }) {
  const { d: RING, length: RING_LENGTH } = ringPath(size, stroke);
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
  }, [value, reduceMotion, hidden, RING_LENGTH]);

  const complete = value >= 1;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style} pointerEvents="none">
      <Path d={RING} fill="none" stroke={complete ? FILL : TRACK} strokeWidth={stroke} />
      {complete ? null : (
        <AnimatedPath
          d={RING}
          fill="none"
          stroke={FILL}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={[RING_LENGTH, RING_LENGTH]}
          strokeDashoffset={hidden}
        />
      )}
    </Svg>
  );
}
