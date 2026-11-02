import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

import { useReducedMotion } from "./motion";

// Small building blocks for Home's motion. Everything uses the built-in
// Animated API on the native driver (no extra packages), plays a fixed
// number of times and then settles, and jumps straight to its end state when
// the phone asks to reduce motion.

const spring = (value, delay, config = {}) =>
  Animated.spring(value, { toValue: 1, delay, friction: 7, tension: 70, useNativeDriver: true, ...config });

// Slides up a little and fades in.
export function Entrance({ delay = 0, distance = 16, style, children, ...rest }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return undefined;
    }
    const run = spring(v, delay);
    run.start();
    return () => run.stop();
  }, [reduce, delay, v]);

  return (
    <Animated.View
      {...rest}
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// The fox beside your chapter, acting like a fox: it pounces in, then every
// few seconds does something small on its own — tilts its head, sniffs the
// ground, or gives its head a quick shake. Tap it and it pounces again.
// Returns the animated style and pounce() for taps. enabled = false switches the behaviours off
// (she stays still), which a fox in a mood of her own (cheering, asleep) uses.
export function useFox(delay = 0, enabled = true) {
  const reduce = useReducedMotion();
  const y = useRef(new Animated.Value(0)).current; // up is negative
  const tilt = useRef(new Animated.Value(0)).current; // degrees
  const squash = useRef(new Animated.Value(1)).current; // scaleY
  const busy = useRef(false);
  const introduced = useRef(false); // she pounces in once, not every time she goes back to idle

  const t = (value, toValue, duration, easing = Easing.inOut(Easing.quad)) =>
    Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

  const play = (animation) => {
    if (busy.current) return;
    busy.current = true;
    animation.start(() => {
      busy.current = false;
    });
  };

  // Crouch, leap, stretch in the air, land with a squash, settle.
  const pounce = () => {
    if (reduce) return;
    busy.current = false;
    play(
      Animated.sequence([
        t(squash, 0.86, 120),
        Animated.parallel([t(y, -20, 220, Easing.out(Easing.quad)), t(squash, 1.08, 220)]),
        Animated.parallel([t(y, 0, 200, Easing.in(Easing.quad)), t(squash, 1, 200)]),
        t(squash, 0.9, 80),
        Animated.spring(squash, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]),
    );
  };

  // Curious head tilt, held a moment.
  const tiltHead = () =>
    play(Animated.sequence([t(tilt, -14, 260), Animated.delay(700), t(tilt, 0, 300)]));

  // Two quick sniffs at the ground.
  const sniff = () =>
    play(
      Animated.sequence([
        Animated.parallel([t(y, 5, 120), t(tilt, 7, 120)]),
        Animated.parallel([t(y, 0, 120), t(tilt, 0, 120)]),
        Animated.parallel([t(y, 5, 120), t(tilt, 7, 120)]),
        Animated.parallel([t(y, 0, 160), t(tilt, 0, 160)]),
      ]),
    );

  // A quick head-shake, like shaking off snow.
  const shake = () =>
    play(
      Animated.sequence([
        t(tilt, 9, 70),
        t(tilt, -9, 90),
        t(tilt, 7, 90),
        t(tilt, -5, 90),
        t(tilt, 0, 80),
      ]),
    );

  useEffect(() => {
    if (reduce || !enabled) return undefined;
    let timer;
    if (!introduced.current) {
      introduced.current = true;
      timer = setTimeout(pounce, delay);
    }
    const behaviours = [tiltHead, sniff, shake];
    const next = () => {
      timer = setTimeout(() => {
        behaviours[Math.floor(Math.random() * behaviours.length)]();
        next();
      }, 3500 + Math.random() * 3500);
    };
    const start = setTimeout(next, delay + 1200);
    return () => {
      clearTimeout(timer);
      clearTimeout(start);
      [y, tilt, squash].forEach((v) => v.stopAnimation());
      busy.current = false;
      y.setValue(0);
      tilt.setValue(0);
      squash.setValue(1);
    };
    // the behaviours only read refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, delay, enabled]);

  const style = {
    transform: [
      { translateY: y },
      { rotate: tilt.interpolate({ inputRange: [-90, 90], outputRange: ["-90deg", "90deg"] }) },
      { scaleY: squash },
    ],
  };
  return { style, pounce };
}

// A quick shake for the streak flame: on arrival and whenever the number changes.
export function useFlicker(key) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return undefined;
    v.setValue(0);
    const run = Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [reduce, key, v]);

  return {
    transform: [
      { rotate: v.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: ["0deg", "-14deg", "12deg", "-8deg", "5deg", "0deg"] }) },
      { scale: v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [1, 1.3, 1] }) },
    ],
  };
}

// Counts from 0 up to value; the real value is what the screen reads.
export function useCountUp(value, duration = 700) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce || !value) {
      setShown(value);
      return undefined;
    }
    const v = new Animated.Value(0);
    const id = v.addListener(({ value: n }) => setShown(Math.round(n)));
    const run = Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start(() => setShown(value));
    return () => {
      run.stop();
      v.removeListener(id);
    };
  }, [reduce, value, duration]);

  return shown;
}
