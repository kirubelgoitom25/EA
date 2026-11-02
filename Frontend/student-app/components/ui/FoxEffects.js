import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { tokens } from "../../theme";
import AppText from "./AppText";
import { useReducedMotion } from "./motion";

// A small effect drawn over the fox for a moment: sparkles when she cheers, a heart when she is
// petted, "z z z" when she dozes off, a "?" when she is curious. Plain icons and text, nothing
// heavy. With Reduce Motion they just appear, still.
const SPARKS = [
  { x: 0.02, y: 0.05, d: 0, s: 18 },
  { x: 0.86, y: 0.0, d: 120, s: 22 },
  { x: 0.7, y: 0.22, d: 240, s: 14 },
];

export default function FoxEffect({ effect, size, nonce }) {
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    p.setValue(0);
    if (reduce) {
      p.setValue(0.5);
      return undefined;
    }
    const run =
      effect === "zzz"
        ? Animated.loop(Animated.timing(p, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }))
        : Animated.timing(p, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [effect, nonce, reduce, p]);

  if (!effect) return null;

  const pulse = p.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] });
  const rise = (distance) => p.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] });

  if (effect === "sparkle") {
    return (
      <>
        {SPARKS.map((spark, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[styles.spot, { left: spark.x * size, top: spark.y * size, opacity: pulse, transform: [{ scale: p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.1, 0.8] }) }, { translateY: rise(10 + i * 4) }] }]}
          >
            <Ionicons name="sparkles" size={spark.s} color={i % 2 ? tokens.tailEnd : tokens.accent} />
          </Animated.View>
        ))}
      </>
    );
  }
  if (effect === "heart") {
    return (
      <Animated.View pointerEvents="none" style={[styles.spot, { left: size * 0.62, top: size * 0.02, opacity: pulse, transform: [{ translateY: rise(26) }, { scale: p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1.15, 1] }) }] }]}>
        <Ionicons name="heart" size={22} color={tokens.tailEnd} />
      </Animated.View>
    );
  }
  if (effect === "question") {
    return (
      <Animated.View pointerEvents="none" style={[styles.spot, { left: size * 0.66, top: 0, opacity: pulse, transform: [{ translateY: rise(10) }] }]}>
        <AppText variant="title" tone="accent">?</AppText>
      </Animated.View>
    );
  }
  // zzz: three Zs, one after another, drifting up and growing
  return (
    <>
      {[0, 1, 2].map((i) => {
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[styles.spot, { left: size * (0.62 + i * 0.1), top: size * (0.12 - i * 0.04), opacity: p.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.9, 0.9, 0] }), transform: [{ translateY: rise(14 + i * 6) }, { scale: 0.7 + i * 0.25 }] }]}
          >
            <AppText variant="label" tone="secondary" style={styles.z}>
              Z
            </AppText>
          </Animated.View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  spot: { position: "absolute" },
  z: { fontSize: 14, lineHeight: 16 },
});
