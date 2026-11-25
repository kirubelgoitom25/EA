import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { haptic } from "../../services/feedback";
import { CURVE, MOTION, reduceMotionNow } from "./motion";

// The one "pressable with an edge" in the app: a face with a darker slab of the same shape directly
// under it (a hard offset, no blur). At rest the edge shows `lipSize` dp; pressed, the face sinks
// `sink` dp (default: all but 1 dp of the edge) in 80 ms and springs back on release. With Reduce
// Motion the face moves without animating. No Android ripple.
//
// - lip: the edge colour; border: a 2 dp border in that colour around the face (white elements)
// - faceStyle: the face (size, colour, padding); radius: both shapes' corners
// - highlight: a 3 dp lighter band along the inside top of the face (path tiles)
// - haptics: a light tick on press
// - pressed: hold it down from outside (a tile pressed by its label)
// - disabled: no taps, no sink
export default function PressLip({
  onPress,
  onLongPress,
  lip,
  lipSize = 5,
  sink,
  radius = 16,
  border = false,
  highlight,
  faceStyle,
  style,
  children,
  hitSlop,
  haptics = false,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  accessibilityHint,
  testID,
}) {
  const press = useRef(new Animated.Value(0)).current;
  const depth = sink ?? Math.max(lipSize - 1, 0);

  const down = () => {
    if (disabled) return;
    if (reduceMotionNow()) return press.setValue(depth);
    Animated.timing(press, { toValue: depth, duration: MOTION.press, easing: CURVE.press, useNativeDriver: true }).start();
  };
  const up = () => {
    if (reduceMotionNow()) return press.setValue(0);
    Animated.spring(press, { toValue: 0, friction: 5, tension: 220, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      onPress={
        disabled || !onPress
          ? undefined
          : (event) => {
              if (haptics) haptic.light();
              onPress(event);
            }
      }
      onLongPress={onLongPress}
      onPressIn={down}
      onPressOut={up}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      testID={testID}
      style={style}
    >
      <EdgeBox lip={lip} lipSize={lipSize} radius={radius} border={border} highlight={highlight} faceStyle={faceStyle} offset={press}>
        {children}
      </EdgeBox>
    </Pressable>
  );
}

// The same face-and-edge without a press (stat chips, cards, banners). offset: an Animated value
// that moves the face down (PressLip's press); style goes on the outer box (size, margins).
export function EdgeBox({ lip, lipSize = 3, radius = 12, border = false, highlight, faceStyle, offset, style, children, ...rest }) {
  return (
    <View style={[{ paddingBottom: lipSize }, style]} {...rest}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: lipSize, borderRadius: radius, backgroundColor: lip }]} />
      <Animated.View
        style={[
          { borderRadius: radius, overflow: highlight ? "hidden" : undefined },
          border && { borderWidth: 2, borderColor: lip },
          faceStyle,
          offset && { transform: [{ translateY: offset }] },
        ]}
      >
        {highlight ? <View pointerEvents="none" style={[styles.highlight, { backgroundColor: highlight }]} /> : null}
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  highlight: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },
});
