import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { CURVE, MOTION, reduceMotionNow } from "./motion";

// Moving between the main tabs (2026-11-12 handoff part 2, section 3): the old screen fades out over
// 120 ms, then the new one fades in while rising 12 dp over 220 ms, and the nav pill slides to the new
// tab. A screen's own entrance animations play only the first time it is opened in a session.

export const TAB_SWITCH = { out: 120, in: 220, rise: 12, pill: 350 };

// The screen on its way out: TabScene multiplies its opacity by this.
const exit = new Animated.Value(1);
let leftAt = 0; // when the last fade-out started
let entering = null; // the tab whose TabScene should fade in when it mounts
let lastTab = null; // the tab the nav bar last showed (its pill slides from there)
const visited = new Set();

// Fades the current tab screen out and calls go() on the next frame. The fade runs on the native
// side while the new screen is built (building a screen takes longer than the fade, so waiting for
// the fade first would leave the screen empty); the new screen fades in no earlier than the fade's
// end. Reduce Motion still fades (nothing moves).
export function leaveTab(target, go) {
  leftAt = Date.now();
  entering = target;
  Animated.timing(exit, { toValue: 0, duration: TAB_SWITCH.out, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  requestAnimationFrame(go);
}

// The first time this tab is opened since the app started (or since the last log out).
export function firstVisit(tab) {
  if (visited.has(tab)) return false;
  visited.add(tab);
  return true;
}

// Logging out starts a new session: every screen plays its entrance again.
export function resetTabSession() {
  visited.clear();
  lastTab = null;
  entering = null;
  exit.setValue(1);
}

// Where the nav pill was before this screen (null on the first screen), and records the new one.
export function pillMove(active) {
  const from = lastTab;
  lastTab = active;
  return from;
}

// A tab screen's content (everything but the nav bar). Fades in rising 12 dp when it was reached
// by a tab switch; otherwise shows at once.
export function TabScene({ tab, children }) {
  const enter = useRef(new Animated.Value(entering === tab ? 0 : 1)).current;
  useEffect(() => {
    const arrived = entering === tab;
    entering = null;
    exit.stopAnimation();
    exit.setValue(1); // the old screen is gone; this one's own value keeps it hidden until it fades in
    if (!arrived) return undefined;
    const run = Animated.timing(enter, {
      toValue: 1,
      delay: Math.max(0, TAB_SWITCH.out - (Date.now() - leftAt)),
      duration: reduceMotionNow() ? MOTION.fade : TAB_SWITCH.in,
      easing: CURVE.screen,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [tab, enter]);

  // built once: a rebuilt native-driver style reads a stale value
  const motion = useMemo(() => {
    const rise = reduceMotionNow() ? 0 : TAB_SWITCH.rise;
    return {
      opacity: Animated.multiply(exit, enter),
      transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
    };
  }, [enter]);
  return (
    <Animated.View style={[styles.scene, motion]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1 },
});
