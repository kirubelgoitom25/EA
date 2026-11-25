import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { ui } from "../../theme";
import { handOff, takeHandoff } from "./handoff";
import { CURVE, MOTION, reduceMotionNow } from "./motion";

// Diving into a course from its card on the Courses tab (handoff part 3, the course → chapter dive of
// part 1): the course page scales from 1.6 to 1 and fades in over 500 ms, with the scale origin at
// the tapped card. Reduce Motion: a plain 150 ms fade.
export const DIVE = { from: 1.6, duration: 500 };

// Called by the card as it opens the course: centre is where on the screen the dive starts.
export function diveFrom(courseId, centre) {
  if (centre) handOff("dive", courseId, centre);
}

// Wraps a course's page. Without a dive handed to it, it just shows its page.
export default function DiveIn({ id, children }) {
  const [dive] = useState(() => {
    const centre = takeHandoff("dive", id);
    return centre ? { centre, value: new Animated.Value(0), reduce: reduceMotionNow() } : null;
  });

  // The course page is heavy to put on screen: started at mount, the dive would run out while nothing
  // is drawn yet. So it starts two frames after the page's first layout.
  const run = useRef(null);
  const started = useRef(false);
  const start = () => {
    if (!dive || started.current) return;
    started.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        run.current = Animated.timing(dive.value, {
          toValue: 1,
          duration: dive.reduce ? MOTION.fade : DIVE.duration,
          easing: CURVE.screen,
          useNativeDriver: true,
        });
        run.current.start();
      }),
    );
  };
  useEffect(() => () => run.current?.stop(), []);

  // built once: a rebuilt native-driver style reads a stale value
  const look = useMemo(() => {
    if (!dive) return null;
    const { value, centre, reduce } = dive;
    return {
      opacity: value,
      transformOrigin: `${Math.round(centre.x)}px ${Math.round(centre.y)}px`,
      transform: reduce ? [] : [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [DIVE.from, 1] }) }],
    };
  }, [dive]);

  if (!dive) return <View style={styles.fill}>{children}</View>;
  // the pale ground shows while the page is still being put together, not a white screen
  return (
    <View style={[styles.fill, styles.ground]}>
      <Animated.View style={[styles.fill, look]} onLayout={start}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ground: { backgroundColor: ui.screen },
});
