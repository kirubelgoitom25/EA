import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Purely cosmetic leveling derived from total XP — there's no
// separate "level" field in the data, so this is just XP / 200,
// consistent every render.
const XP_PER_LEVEL = 200;

export default function XpProgressRing({ xp, size = 84, strokeWidth = 8 }) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const percent = xpIntoLevel / XP_PER_LEVEL;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedPercent = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedPercent, {
      toValue: percent,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  const strokeDashoffset = animatedPercent.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2a2a2a"
          strokeWidth={strokeWidth}
          fill="none"
        />

        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#ffd23f"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>

      <View style={styles.center}>
        <Text style={styles.levelLabel}>LVL</Text>
        <Text style={styles.levelValue}>{level}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },

  levelLabel: {
    color: "#aaa",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },

  levelValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginTop: -2,
  },
});
