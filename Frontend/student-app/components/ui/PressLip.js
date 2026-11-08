import React, { useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

// A tile with a solid edge under it that sinks when tapped (the same press as the chapter tiles).
// `faceStyle` sets the face (its size, colour, border, radius); `lip` is the edge's colour and
// `lipSize` how much of it shows; a tap sinks the face `sink` dp. No Android ripple.
export default function PressLip({
  onPress,
  lip,
  lipSize = 5,
  sink = 5,
  radius,
  faceStyle,
  style,
  children,
  hitSlop,
  accessibilityLabel,
}) {
  const press = useRef(new Animated.Value(0)).current;

  const down = () =>
    Animated.timing(press, { toValue: sink, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  const up = () => Animated.spring(press, { toValue: 0, friction: 5, tension: 220, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={down}
      onPressOut={up}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <View style={{ paddingBottom: lipSize }}>
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { top: lipSize, borderRadius: radius, backgroundColor: lip }]}
        />
        <Animated.View style={[faceStyle, { borderRadius: radius, transform: [{ translateY: press }] }]}>
          {children}
        </Animated.View>
      </View>
    </Pressable>
  );
}
