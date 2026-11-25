import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import { ui } from "../../theme";
import { CURVE, MOTION, reduceMotionNow } from "./motion";

const W = 54;
const H = 32;
const KNOB_W = 24;
const KNOB_H = 22;
const KNOB_EDGE = 2;
const INSET = 4;
const OFF_X = INSET;
const ON_X = W - INSET - KNOB_W;

const ON = { track: ui.primary, inset: ui.primaryEdge }; // #3E7257 / #2A5540
const OFF = { track: ui.disabledCta.face, inset: ui.disabledCta.edge }; // #D9E2DC / #BCC7C0

// An on/off switch (handoff part 2): a 54 x 32 track with a 3 dp darker inset along its top, and a
// white knob with a 2 dp edge under it. Switching, the knob slides across in 300 ms with overshoot
// and the track colour fades in 200 ms; pressed, the knob sinks onto its edge. Reduce Motion: the
// colour still fades, nothing slides.
export default function Toggle({ value, onValueChange, accessibilityLabel }) {
  const x = useRef(new Animated.Value(value ? ON_X : OFF_X)).current;
  const tint = useRef(new Animated.Value(value ? 1 : 0)).current;
  const sink = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const to = value ? ON_X : OFF_X;
    const moves = [
      Animated.timing(tint, { toValue: value ? 1 : 0, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: false }),
    ];
    if (reduceMotionNow()) x.setValue(to);
    else moves.push(Animated.timing(x, { toValue: to, duration: 300, easing: CURVE.pop, useNativeDriver: false }));
    const run = Animated.parallel(moves);
    run.start();
    return () => run.stop();
  }, [value, x, tint]);

  const colours = useMemo(
    () => ({
      track: { backgroundColor: tint.interpolate({ inputRange: [0, 1], outputRange: [OFF.track, ON.track] }) },
      inset: { backgroundColor: tint.interpolate({ inputRange: [0, 1], outputRange: [OFF.inset, ON.inset] }) },
    }),
    [tint],
  );

  const press = (down) => {
    const toValue = down ? KNOB_EDGE : 0;
    if (reduceMotionNow()) return sink.setValue(toValue);
    Animated.timing(sink, { toValue, duration: MOTION.press, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, colours.track]}>
        <Animated.View style={[styles.inset, colours.inset]} />
        <Animated.View style={[styles.knobBox, { left: x }]}>
          <View style={styles.knobEdge} />
          <Animated.View style={[styles.knob, { transform: [{ translateY: sink }] }]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: W,
    height: H,
    borderRadius: H / 2,
    overflow: "hidden",
  },

  inset: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },

  // knob and its edge, vertically centred: (32 - 22 - 2) / 2 = 4 from the top
  knobBox: {
    position: "absolute",
    top: (H - KNOB_H - KNOB_EDGE) / 2,
    width: KNOB_W,
    height: KNOB_H + KNOB_EDGE,
  },

  knobEdge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: KNOB_EDGE,
    bottom: 0,
    borderRadius: KNOB_H / 2,
    backgroundColor: ui.surfaceEdge,
  },

  knob: {
    width: KNOB_W,
    height: KNOB_H,
    borderRadius: KNOB_H / 2,
    backgroundColor: ui.surface,
  },
});
