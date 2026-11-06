import React, { useEffect, useId, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from "react-native-svg";

import { BLINK, CSS_EASE, LID, OPEN } from "./FoxPeek";
import { EDGE_FOX, TAIL_PIVOT } from "./foxPlacement";

// The course path's fox (see mascotVariant in config.js). Two pictures:
// - FoxFigure: the whole fox standing, her tail (its own layer, behind her) wagging now and then,
//   blinking, and either breathing ("title") or swaying gently from her feet ("ledge")
// - FoxHeadLean: just her head, turned, leaning in from the edge of the screen and back out ("edge")
// She is only to look at: she takes no touches (everything under her stays tappable) and screen
// readers skip her. With reduce motion on she holds still, eyes open (the head leant in).
// Timings follow the design: tail 5.2 s, blink 7.3 s, breath 4.4 s, sway 5 s, peek 10 s.

const BODY = require("../../assets/fox/fox-body.png");
const TAIL = require("../../assets/fox/fox-tail.png");
const HEAD = require("../../assets/fox/fox-head-peek.png");

const TAIL_LOOP = 5200;
// [ms, degrees]: still until 2.7 s, then a wag, ease-in-out between each
const WAG = [
  [2704, 0],
  [3120, 6],
  [3536, -3],
  [3952, 6],
  [4368, -3],
  [4784, 0],
];
const BREATH = 4400;
const SWAY = 5000;

const timing = (value, toValue, duration, easing = CSS_EASE) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

// Runs the loops made by build() while motion is allowed; with reduce motion, puts each value at rest.
function useLoops(reduce, build, rest) {
  useEffect(() => {
    if (reduce) {
      rest();
      return undefined;
    }
    const loops = build();
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);
}

// The blink: how shut the eyelids are (0 open .. 1 shut), on the same pattern as the Home fox.
function useBlink(reduce) {
  const blink = useRef(new Animated.Value(0)).current;
  useLoops(
    reduce,
    () => [Animated.loop(Animated.timing(blink, { toValue: BLINK, duration: BLINK, easing: Easing.linear, useNativeDriver: true }))],
    () => blink.setValue(0),
  );
  return blink.interpolate({ inputRange: LID.map(([ms]) => ms), outputRange: LID.map(([, v]) => Math.max(v, OPEN)) });
}

// The two eyelids over her eyes, at the spot `lids` gives (dp on the unscaled picture).
function Eyelids({ lids, k, shut }) {
  const id = `lid${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return lids.at.map((left, i) => (
    <Animated.View
      key={left}
      style={{
        position: "absolute",
        left: left * k,
        top: lids.top * k,
        width: lids.w * k,
        height: lids.h * k,
        transformOrigin: "top",
        transform: [{ scaleY: shut }],
      }}
    >
      <Eyelid id={`${id}-${i}`} lids={lids} k={k} />
    </Animated.View>
  ));
}

// A shut eyelid: an oval in her fur's colours, with the curved line of a closed eye.
function Eyelid({ id, lids, k }) {
  const { w, h, line } = lids;
  const half = line.thick / 2;
  const startY = line.top + half;
  const lowest = line.top + line.h - half; // the bottom of the curve
  const d = `M${line.left + half} ${startY} Q${line.left + line.w / 2} ${2 * lowest - startY} ${line.left + line.w - half} ${startY}`;
  return (
    <Svg width={w * k} height={h * k} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F0930A" />
          <Stop offset="1" stopColor="#F6BE1E" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={`url(#${id})`} />
      <Path d={d} stroke="#5B2A86" strokeWidth={line.thick} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// The whole fox standing. spec: TITLE_FOX or LEDGE_FOX (its size and eyelids); k: the screen's scale;
// motion: "breathe" or "sway".
export function FoxFigure({ spec, k, motion, reduce, style }) {
  const w = spec.w * k;
  const h = spec.h * k;
  const wag = useRef(new Animated.Value(0)).current;
  const body = useRef(new Animated.Value(0)).current;
  const shut = useBlink(reduce);

  useLoops(
    reduce,
    () => {
      const steps = [Animated.delay(WAG[0][0])];
      for (let i = 1; i < WAG.length; i += 1) steps.push(timing(wag, WAG[i][1], WAG[i][0] - WAG[i - 1][0]));
      steps.push(Animated.delay(TAIL_LOOP - WAG[WAG.length - 1][0]));
      const half = (motion === "sway" ? SWAY : BREATH) / 2;
      return [Animated.loop(Animated.sequence(steps)), Animated.loop(Animated.sequence([timing(body, 1, half), timing(body, 0, half)]))];
    },
    () => {
      wag.setValue(0);
      body.setValue(0);
    },
  );

  const whole =
    motion === "sway"
      ? { transformOrigin: "68% 100%", transform: [{ rotate: body.interpolate({ inputRange: [0, 1], outputRange: ["-1.5deg", "1.5deg"] }) }] }
      : { transformOrigin: "50% 100%", transform: [{ scaleY: body.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }) }] };

  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[{ width: w, height: h }, style]}>
      <Animated.View style={[{ width: w, height: h }, reduce ? null : whole]}>
        <Animated.Image
          source={TAIL}
          resizeMode="contain"
          style={[
            styles.layer,
            { width: w, height: h },
            reduce
              ? null
              : {
                  transformOrigin: `${TAIL_PIVOT[0] * 100}% ${TAIL_PIVOT[1] * 100}%`,
                  transform: [{ rotate: wag.interpolate({ inputRange: [-3, 6], outputRange: ["-3deg", "6deg"] }) }],
                },
          ]}
        />
        <Image source={BODY} resizeMode="contain" style={[styles.layer, { width: w, height: h }]} />
        {reduce ? null : <Eyelids lids={spec.lids} k={k} shut={shut} />}
      </Animated.View>
    </View>
  );
}

// Her head, turned -62 degrees, leaning in from the right edge (from the left, mirrored), sliding
// out of sight and back in every 10 s. The box is the unturned head's; the screen edge clips her.
export function FoxHeadLean({ k, mirrored, reduce, style }) {
  const w = EDGE_FOX.w * k;
  const h = EDGE_FOX.h * k;
  const out = EDGE_FOX.peek * k;
  const peek = useRef(new Animated.Value(reduce ? 0 : out)).current;
  const shut = useBlink(reduce);

  useLoops(
    reduce,
    () => {
      peek.setValue(out);
      return [
        Animated.loop(
          Animated.sequence([
            Animated.delay(600), // out of sight until 0.6 s
            timing(peek, 0, 1000), // in by 1.6 s
            Animated.delay(5800), // until 7.4 s
            timing(peek, out, 1000), // out by 8.4 s
            Animated.delay(1600), // until 10 s
          ]),
        ),
      ];
    },
    () => peek.setValue(0),
  );

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width: w, height: h, transform: [{ translateX: mirrored ? Animated.multiply(peek, -1) : peek }] }, style]}
    >
      <View style={{ width: w, height: h, transform: [...(mirrored ? [{ scaleX: -1 }] : []), { rotate: `${EDGE_FOX.rotate}deg` }] }}>
        <Image source={HEAD} resizeMode="contain" style={{ width: w, height: h }} />
        {reduce ? null : <Eyelids lids={EDGE_FOX.lids} k={k} shut={shut} />}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, top: 0 },
});
