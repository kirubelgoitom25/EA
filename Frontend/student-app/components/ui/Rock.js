import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, Ellipse, Path, Polygon, RadialGradient, Stop } from "react-native-svg";

import { stone, tokens } from "../../theme";
import { useReducedMotion } from "./motion";

// A step on the path: a chunky rounded key with a solid lip under it that presses in when tapped.
// - done: pale sage with a dark check
// - next (where you are): sage with a white play triangle, inside a ring; it plays a short
//   6-second routine (ring pulse, the triangle hops, spins, lands with a squash) and then rests
// - todo: light grey with a grey star
// `size` is the tile's width; the picture has room around it for the ring.
const LOOKS = {
  done: { face: "#A9D3BC", lip: "#84B89B", ink: "#27503B" },
  next: { face: tokens.accent, lip: tokens.accentLip, ink: "#FFFFFF" },
  todo: { face: stone.rock, lip: stone.rockEdge, ink: stone.rockInk },
};
export const ROCKS = LOOKS;

export const LIP = 6; // the solid bottom edge
const PRESS = 5; // how far a tap sinks the key (the edge goes from 6 to 1)
const LOOP = 6000; // the current step's routine, in ms

// How big the picture is, and where the tile's middle is in it, for a tile `size` wide.
export const rockBox = (size) => ({ width: size * 1.4, height: size * 1.4, cx: size * 0.7, cy: size * 0.7 });

// How far above the tile's middle (the path point) the current step's ring starts, for a tile `size`
// wide: a fox peeking over the ring tucks in under this line.
export const ringTop = (size) => {
  const k = size / 84;
  return (rockBox(size).height - size - LIP) / 2 - 12 * k - rockBox(size).cy;
};

// A track of keyframes, [time ms, value, easing into it], sampled so a single linear timing can
// play eased segments (interpolate itself is linear between points).
function track(first, ...keys) {
  const inputRange = [0];
  const outputRange = [first];
  let [t0, v0] = [0, first];
  keys.forEach(([t1, v1, ease]) => {
    const steps = ease ? 8 : 1;
    for (let s = 1; s <= steps; s += 1) {
      const p = s / steps;
      inputRange.push(t0 + (t1 - t0) * p);
      outputRange.push(v0 + (v1 - v0) * (ease ? ease(p) : p));
    }
    [t0, v0] = [t1, v1];
  });
  if (t0 < LOOP) {
    inputRange.push(LOOP);
    outputRange.push(v0);
  }
  return { inputRange, outputRange };
}

const OUT = Easing.out(Easing.quad);
const IN = Easing.in(Easing.quad); // falling: speeds up like gravity
const IN_OUT = Easing.inOut(Easing.quad);

// The routine, from the spec (times in ms). Impact at 3180, still from 3720 to 6000.
const ICON_PIVOT = 0.38; // the squash happens from the triangle's base: 88% down the icon box
const SQUASH_Y = [1, 0.76, 1.07, 1];
const TRACKS = {
  ring: track(1, [750, 1.1, IN_OUT], [1500, 1, IN_OUT], [3060, 1], [3180, 1.05, OUT], [3720, 1, IN_OUT]),
  lift: track(0, [1500, 0], [1980, -13, OUT], [2700, -13], [3060, 0, IN], [3180, 0], [3420, -3, OUT], [3720, 0, IN_OUT]),
  spin: track(0, [1980, 0], [2700, 360, IN_OUT]),
  scaleX: track(1, [3060, 1], [3180, 1.22, OUT], [3420, 0.94, IN_OUT], [3720, 1, IN_OUT]),
  scaleY: track(1, [3060, SQUASH_Y[0]], [3180, SQUASH_Y[1], OUT], [3420, SQUASH_Y[2], IN_OUT], [3720, SQUASH_Y[3], IN_OUT]),
  shadowOpacity: track(0, [1500, 0], [1980, 0.34, OUT], [2700, 0.34], [3060, 0.3, IN], [3300, 0, OUT]),
  shadowScale: track(1.15, [1500, 1.15], [1980, 0.72, OUT], [2700, 0.72], [3060, 1.2, IN], [3300, 1.3]),
  dip: track(0, [3030, 0], [3180, 4, OUT], [3480, -1, IN_OUT], [3720, 0, IN_OUT]),
};

// wait: ms before the current step's routine first plays.
export default function Rock({ status = "todo", size = 84, icon, children, ring = false, pressed = false, wait = 1200 }) {
  const look = LOOKS[status] ?? LOOKS.todo;
  const box = rockBox(size);
  const k = size / 84; // everything in the spec is for an 84 dp key
  const reduce = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current; // where in the routine we are; 0 is at rest
  const press = useRef(new Animated.Value(0)).current; // how far a finger has pushed the key in
  const routine = useRef(null);
  const stopped = useRef(false); // a tap ends the routine for as long as the screen is up

  // The routine: only the current step, never with reduce motion, and never again after a tap.
  useEffect(() => {
    if (!ring || reduce || stopped.current) return undefined;
    t.setValue(0);
    routine.current = Animated.sequence([
      Animated.delay(wait), // let the screen's arrival settle first, so nothing else moves with it
      Animated.loop(Animated.timing(t, { toValue: LOOP, duration: LOOP, easing: Easing.linear, useNativeDriver: true })),
    ]);
    routine.current.start();
    return () => routine.current?.stop();
  }, [ring, reduce, t, wait]);

  // The press: sinks in 80 ms, springs back on release. A tap stops the routine where it is and
  // puts the key at rest first.
  useEffect(() => {
    if (pressed) {
      if (routine.current) {
        stopped.current = true;
        routine.current.stop();
        routine.current = null;
        t.setValue(0);
      }
      Animated.timing(press, { toValue: PRESS, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else {
      Animated.spring(press, { toValue: 0, friction: 5, tension: 220, useNativeDriver: true }).start();
    }
  }, [pressed, press, t]);

  const moving = ring && !reduce;
  const anim = useMemo(() => {
    const at = (name, map = (v) => v) => {
      const { inputRange, outputRange } = TRACKS[name];
      return t.interpolate({ inputRange, outputRange: outputRange.map(map), extrapolate: "clamp" });
    };
    const iconSize = 40 * k;
    return {
      ring: at("ring"),
      // the triangle's height, plus what keeps its base on the floor while it squashes
      iconY: Animated.add(at("lift", (v) => v * k), at("scaleY", (v) => ICON_PIVOT * iconSize * (1 - v))),
      spin: at("spin", (v) => `${v}deg`),
      scaleX: at("scaleX"),
      scaleY: at("scaleY"),
      shadowOpacity: at("shadowOpacity"),
      shadowScale: at("shadowScale"),
      dip: Animated.add(press, at("dip", (v) => v * k)),
    };
  }, [t, press, k]);

  const left = (box.width - size) / 2;
  const top = (box.height - size - LIP) / 2;
  const radius = 26 * k;
  const drop = moving ? anim.dip : press;

  const glyph = icon ? <Glyph name={icon} ink={look.ink} k={k} /> : children;

  return (
    <View style={{ width: box.width, height: box.height }}>
      {ring ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: left - 12 * k,
            top: top - 12 * k,
            width: size + 24 * k,
            height: size + 24 * k,
            borderRadius: 36 * k,
            borderWidth: 6 * k,
            borderColor: tokens.accent,
            backgroundColor: tokens.surface,
            transform: moving ? [{ scale: anim.ring }] : [],
          }}
        />
      ) : null}

      {/* the solid edge: a darker key under the face; the face sinks into it */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left, top: top + LIP, width: size, height: size, borderRadius: radius, backgroundColor: look.lip }}
      />

      <Animated.View
        style={{
          position: "absolute",
          left,
          top,
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: look.face,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ translateY: drop }],
        }}
      >
        {moving ? (
          <>
            {/* the triangle's shadow on the key while it is in the air: stays put, never turns */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: (size - 40 * k) / 2,
                top: 61 * k,
                opacity: anim.shadowOpacity,
                transform: [{ scale: anim.shadowScale }],
              }}
            >
              <SoftOval k={k} />
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: anim.iconY }, { scaleX: anim.scaleX }, { scaleY: anim.scaleY }] }}>
              {/* the triangle turns about its own middle, a little left of the box's */}
              <Animated.View style={{ transform: [{ translateX: -1.6 * k }, { rotate: anim.spin }, { translateX: 1.6 * k }] }}>
                {glyph}
              </Animated.View>
            </Animated.View>
          </>
        ) : (
          glyph
        )}
      </Animated.View>
    </View>
  );
}

// The step's icon. Chapters use drawn check / play / star; other steps (reading, questions) use
// their Ionicons glyph.
export function Glyph({ name, ink, k }) {
  if (name === "checkmark") {
    const s = 38 * k;
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <Path d="M20 6 9 17l-5-5" stroke={ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (name === "play") {
    const s = 40 * k;
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24">
        <Polygon points="7 4 20 12 7 20 7 4" fill={ink} stroke={ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (name === "star") {
    const s = 34 * k;
    return (
      <Svg width={s} height={s} viewBox="0 0 24 24">
        <Polygon
          points="12 3 14.8 8.7 21 9.6 16.5 14 17.6 20.2 12 17.3 6.4 20.2 7.5 14 3 9.6 9.2 8.7 12 3"
          fill={ink}
          stroke={ink}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return <Ionicons name={name} size={36 * k} color={ink} />;
}

// A 36 x 8 black oval with a soft edge (React Native has no blur, so the edge fades out instead).
function SoftOval({ k }) {
  return (
    <Svg width={40 * k} height={12 * k} viewBox="0 0 40 12">
      <Defs>
        <RadialGradient id="soft" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#000000" stopOpacity={1} />
          <Stop offset="0.72" stopColor="#000000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={20} cy={6} rx={20} ry={6} fill="url(#soft)" />
    </Svg>
  );
}

// A dome (the den): the end of a part, and of the course. Pale and shut ahead; once you arrive it is
// deep sage with its door lit.
export function Dome({ size = 40, lit = false }) {
  return (
    <Svg width={size} height={size * 0.82} viewBox="0 0 100 82">
      <Path d="M8 72 V50 A42 42 0 0 1 92 50 V72 Z" fill={lit ? stone.denEdge : stone.denOffEdge} />
      <Path d="M8 66 V48 A42 42 0 0 1 92 48 V66 Z" fill={lit ? stone.den : stone.denOff} />
      <Path d="M22 44 A30 30 0 0 1 50 22 A30 30 0 0 0 28 48 Z" fill={lit ? stone.denLight : stone.denOffLight} opacity={0.6} />
      <Path d="M38 66 V54 A12 12 0 0 1 62 54 V66 Z" fill={lit ? "#FFE3A3" : stone.denOffDoor} />
    </Svg>
  );
}
