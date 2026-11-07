import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Path } from "react-native-svg";

import { ROCKS } from "./Rock";
import { SPARK, SPARKS } from "./pathMotionModel";

// The burst when a step is completed: six small particles out of its button, once. They take no
// touches and screen readers skip them. x, y: the button's middle on the path; delay: wait this long
// (ms) first; onDone: they are gone.
const COLOURS = { gold: "#F2B84B", done: ROCKS.done.lip };
const STAR = "M7 0C7.6 4.6 9.4 6.4 14 7C9.4 7.6 7.6 9.4 7 14C6.4 9.4 4.6 7.6 0 7C4.6 6.4 6.4 4.6 7 0Z";

export default function Sparkle({ x, y, delay = 0, onDone }) {
  const life = useRef(new Animated.Value(0)).current; // 0..1 over the whole burst
  const fly = useRef(new Animated.Value(0)).current; // 0..1 over the flight, easing out
  const finish = useRef(onDone);
  finish.current = onDone;

  useEffect(() => {
    const timing = (value, duration, easing) => Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: true });
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([timing(life, SPARK.life, Easing.linear), timing(fly, SPARK.fly, Easing.out(Easing.quad))]),
    ]);
    run.start(({ finished }) => finished && finish.current?.());
    return () => run.stop();
  }, [delay, life, fly]);

  const particles = useMemo(() => {
    const landed = SPARK.fly / SPARK.life;
    const opacity = life.interpolate({ inputRange: [0, SPARK.fadeIn / SPARK.life, landed, 1], outputRange: [0, 1, 1, 0] });
    const scale = Animated.multiply(
      fly.interpolate({ inputRange: [0, 1], outputRange: [SPARK.scaleFrom, 1] }),
      life.interpolate({ inputRange: [0, landed, 1], outputRange: [1, 1, SPARK.scaleEnd] }),
    );
    return SPARKS.map(({ dx, dy }) => ({
      opacity,
      transform: [
        { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
        { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
        { scale },
      ],
    }));
  }, [life, fly]);

  return SPARKS.map(({ shape, colour }, i) => {
    const size = shape === "star" ? SPARK.star : SPARK.dot;
    return (
      <Animated.View
        key={i}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size }, particles[i]]}
      >
        {shape === "star" ? (
          <Svg width={size} height={size} viewBox="0 0 14 14">
            <Path d={STAR} fill={COLOURS[colour]} />
          </Svg>
        ) : (
          <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLOURS[colour] }} />
        )}
      </Animated.View>
    );
  });
}
