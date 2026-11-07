import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PixelRatio, StyleSheet, View } from "react-native";

import { STEPS, bandsFor, bandsNear, dashesAlong, sameSet, trackOf } from "./driftModel";

// The course page's dashed line, drifting forward one dash every `duration` ms. Each dash is a
// small native view moved along the curve by the native animation driver, so nothing is repainted
// while it moves (see driftModel.js for why, and for how it matches the stroked line).
//
// scrollY / viewHeight (optional): where the screen is, in the route's coordinates. Dashes far
// from it hold still; without them every dash moves.
export default function DriftingLine({
  points,
  curve,
  last,
  height,
  dash,
  thickness,
  lineColor,
  doneColor,
  duration,
  scrollY = null,
  viewHeight = null,
}) {
  const [on, off] = dash.split(" ").map(Number);
  const period = on + off;
  const shape = useMemo(
    () => ({
      position: "absolute",
      left: -(on + thickness) / 2,
      top: -thickness / 2,
      width: on + thickness,
      height: thickness,
      borderRadius: thickness / 2,
    }),
    [on, thickness],
  );

  const pointsKey = points.map((p) => `${p.x},${p.y}`).join(";");
  const track = useMemo(() => trackOf(points, curve), [pointsKey, curve]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneLength = last > 0 ? track.ends[last - 1] ?? 0 : 0;
  const bands = useMemo(() => bandsFor(height, PixelRatio.get()), [height]);
  const dashes = useMemo(
    () => dashesAlong(track, { period, on, doneLength, bands }),
    [track, period, on, doneLength, bands],
  );

  // One clock for the whole line, on the UI thread.
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    phase.setValue(0);
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, duration]);

  const moving = useMemo(
    () =>
      dashes.map((d) => ({
        opacity: d.fades ? phase.interpolate({ inputRange: STEPS, outputRange: d.alphas }) : 1,
        transform: [
          { translateX: phase.interpolate({ inputRange: STEPS, outputRange: d.xs }) },
          { translateY: phase.interpolate({ inputRange: STEPS, outputRange: d.ys }) },
          { rotate: phase.interpolate({ inputRange: STEPS, outputRange: d.angles.map((a) => `${a}deg`) }) },
        ],
      })),
    [dashes, phase],
  );
  const still = useMemo(
    () =>
      dashes.map((d) => ({
        opacity: d.alphas[0],
        transform: [{ translateX: d.xs[0] }, { translateY: d.ys[0] }, { rotate: `${d.angles[0]}deg` }],
      })),
    [dashes],
  );

  const [near, setNear] = useState(() => bandsNear(bands, scrollY ? 0 : null, scrollY ? viewHeight : null));
  useEffect(() => {
    if (!scrollY) {
      const all = bandsNear(bands, null, null);
      setNear((now) => (sameSet(now, all) ? now : all));
      return undefined;
    }
    const update = ({ value }) => {
      const next = bandsNear(bands, value, viewHeight);
      setNear((now) => (sameSet(now, next) ? now : next));
    };
    const id = scrollY.addListener(update);
    update({ value: scrollY.__getValue ? scrollY.__getValue() : 0 });
    return () => scrollY.removeListener(id);
  }, [bands, scrollY, viewHeight]);

  const colors = useMemo(
    () => ({ line: { backgroundColor: lineColor }, done: { backgroundColor: doneColor } }),
    [lineColor, doneColor],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dashes.map((d, i) => (
        <Animated.View
          key={d.key}
          style={[shape, d.done ? colors.done : colors.line, near.has(d.band) ? moving[i] : still[i]]}
        />
      ))}
    </View>
  );
}
