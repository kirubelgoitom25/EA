import React, { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useReducedMotion } from "./motion";

// Confetti falling and turning through a band `height` dp tall. colors: the pieces' colours, in turn.
// loop: keep falling (each piece starts again at the top); otherwise one shower. Nothing when motion
// is reduced.
export default function Confetti({ colors, width, height, count = 22, loop = false }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: ((i * 37) % 100) / 100,
        delay: (i % 7) * 140,
        drift: ((i % 5) - 2) * 14,
        size: 7 + (i % 3) * 3,
        round: i % 2 === 0,
        color: colors[i % colors.length],
        value: new Animated.Value(0),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, colors.join()],
  );
  useEffect(() => {
    if (reduce) return undefined;
    const runs = pieces.map((p) => {
      const fall = Animated.timing(p.value, { toValue: 1, duration: 2600 + (p.delay % 5) * 200, easing: Easing.in(Easing.quad), useNativeDriver: true });
      return loop
        ? Animated.sequence([Animated.delay(p.delay), Animated.loop(fall)])
        : Animated.sequence([Animated.delay(p.delay), fall]);
    });
    const all = Animated.parallel(runs);
    all.start();
    return () => all.stop();
  }, [pieces, reduce, loop]);
  if (reduce) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: p.x * (width - 20) + 10,
            top: -20,
            width: p.size,
            height: p.round ? p.size : p.size * 1.8,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: p.value.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: p.value.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
              { translateX: p.value.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.value.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.drift * 12}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
