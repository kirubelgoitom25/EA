import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from "react-native-svg";

import { space, tokens } from "../../theme";
import AppText from "./AppText";
import { useFoxReact, useFoxReaction } from "./FoxContext";
import { useReducedMotion } from "./motion";

// The fox's head peeking over the current step's ring (Home). She is calm: she breathes and blinks,
// and that is all. She never hops. Tapping her still tells the fox brain, and the few words it gives
// her show in a small bubble, as before.
// - side: "left" / "right", the half of the screen she is on, so her bubble grows toward the middle
const HEAD = require("../../assets/fox/fox-head-peek.png");

export const PEEK = { width: 108, height: 95, tuck: 12 }; // tuck: how much of her sits behind the ring

const BREATH = 4400; // ms, one breath in and out
export const BLINK = 7300; // ms, the blink pattern
export const CSS_EASE = Easing.bezier(0.42, 0, 0.58, 1); // ease-in-out

// The eyelids' height (0 open, 1 shut) through the blink pattern, [ms, value]; linear in between.
export const LID = [
  [0, 0],
  [1530, 0],
  [1620, 1],
  [1710, 1],
  [1830, 0],
  [5550, 0],
  [5620, 1],
  [5690, 1],
  [5800, 0],
  [5910, 0],
  [5980, 1],
  [6060, 1],
  [6170, 0],
  [BLINK, 0],
];
export const OPEN = 0.0001; // an open lid: flat to nothing (a scale of exactly 0 can upset Android)

// Where the eyelids go on the 108 x 95 head, from its top-left corner.
const LIDS = [32, 60.7];
const LID_TOP = 54;
const LID_W = 15;
const LID_H = 17.5;

export default function FoxPeek({ side = "right" }) {
  const reduce = useReducedMotion();
  const react = useFoxReact();
  const reaction = useFoxReaction(true);
  const breath = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      breath.setValue(0);
      blink.setValue(0);
      return undefined;
    }
    const t = (value, toValue, duration, easing) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
    const loops = [
      Animated.loop(Animated.sequence([t(breath, 1, BREATH / 2, CSS_EASE), t(breath, 0, BREATH / 2, CSS_EASE)])),
      Animated.loop(t(blink, BLINK, BLINK, Easing.linear)), // the loop starts again from 0 each time
    ];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [reduce, breath, blink]);

  // The few words from the brain, for a moment.
  const [text, setText] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    if (!reaction.caption) return;
    setText(reaction.caption);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 2800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction.nonce]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const lid = blink.interpolate({ inputRange: LID.map(([ms]) => ms), outputRange: LID.map(([, v]) => Math.max(v, OPEN)) });
  const breathing = reduce
    ? null
    : {
        transformOrigin: "bottom",
        transform: [
          { translateY: breath.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) },
          { rotate: breath.interpolate({ inputRange: [0, 1], outputRange: ["-1deg", "1deg"] }) },
        ],
      };

  return (
    <View pointerEvents="box-none" style={styles.box}>
      <Animated.View pointerEvents="box-none" style={[styles.box, breathing]}>
        <Pressable onPress={() => react("tap")} accessibilityRole="button" accessibilityLabel="Pet the fox">
          <Image source={HEAD} style={styles.head} resizeMode="contain" />
          {reduce
            ? null
            : LIDS.map((left, i) => (
                <Animated.View
                  key={left}
                  pointerEvents="none"
                  style={[styles.lid, { left, transformOrigin: "top", transform: [{ scaleY: lid }] }]}
                >
                  <Eyelid id={`fox-lid-${i}`} />
                </Animated.View>
              ))}
        </Pressable>
      </Animated.View>
      {text ? (
        <View pointerEvents="none" style={[styles.bubbleBox, side === "left" ? styles.bubbleLeft : styles.bubbleRight]}>
          <View style={styles.bubble} accessibilityLiveRegion="polite">
            <AppText variant="label" numberOfLines={2}>
              {text}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// A shut eyelid: an orange oval in the fox's fur colours, with the curved line of a closed eye.
function Eyelid({ id }) {
  return (
    <Svg width={LID_W} height={LID_H} viewBox={`0 0 ${LID_W} ${LID_H}`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F0930A" />
          <Stop offset="1" stopColor="#F6BE1E" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={LID_W / 2} cy={LID_H / 2} rx={LID_W / 2} ry={LID_H / 2} fill={`url(#${id})`} />
      <Path d="M2.75 9.25 Q7.5 14.5 12.25 9.25" stroke="#5B2A86" strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  box: { width: PEEK.width, height: PEEK.height },
  head: { width: PEEK.width, height: PEEK.height },
  lid: { position: "absolute", top: LID_TOP, width: LID_W, height: LID_H },

  bubbleBox: { position: "absolute", bottom: PEEK.height + 4, width: 190 },
  bubbleLeft: { left: 0, alignItems: "flex-start" },
  bubbleRight: { right: 0, alignItems: "flex-end" },
  bubble: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: 14,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.divider,
    shadowColor: "#2B1A38",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
