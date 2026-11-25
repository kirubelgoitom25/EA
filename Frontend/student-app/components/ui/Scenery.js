import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect, SvgXml } from "react-native-svg";

import { ui } from "../../theme";
import { useReducedMotion } from "./motion";
import { FOOTER_ART, PATH_ART, PATH_ART_FILL, PATH_ART_SEAM } from "./sceneryArt";

// The path screens' background tile behind a path (2026-11-12 path fixes, section 5): scaled to the
// screen's width (aspect kept, like the path's own rows), and repeated straight down from the path's top,
// never mirrored, as far as the path and the `below` room past its end reach. It never moves on its own.
export const PathBackdrop = memo(function PathBackdrop({ width, height, below = 0, style }) {
  if (!width || !height) return null;
  const copyHeight = (PATH_ART.height * width) / PATH_ART.width;
  const copies = Math.max(1, Math.ceil((height + below) / copyHeight));
  return (
    <View pointerEvents="none" style={[styles.fill, { width, height: height + below, backgroundColor: PATH_ART_FILL }, style]}>
      {/* under each join, the near hill's green (both copies show it there), so a copy's edge landing between
          two pixels blends into the same green and no hairline shows */}
      {Array.from({ length: copies - 1 }, (_, i) => (
        <View key={`join-${i}`} style={[styles.copy, { top: (i + 1) * copyHeight - 2, width, height: 4, backgroundColor: PATH_ART_SEAM }]} />
      ))}
      {Array.from({ length: copies }, (_, i) => (
        <View key={i} style={[styles.copy, { top: i * copyHeight, width, height: copyHeight }]}>
          <SvgXml xml={PATH_ART.xml} width={width} height={copyHeight} />
        </View>
      ))}
    </View>
  );
});

// The supplied footer artwork, pinned to the bottom of question and result screens, behind the button.
export const LightScenery = memo(function LightScenery({ width }) {
  if (!width) return null;
  const height = (FOOTER_ART.height * width) / FOOTER_ART.width;
  return (
    <View pointerEvents="none" style={[styles.bottom, { width, height }]}>
      <SvgXml xml={FOOTER_ART.xml} width={width} height={height} />
    </View>
  );
});

// The stage result's scene (section 9; no artwork file was supplied for it): sky, a soft sun, hills
// and two pines. The den is drawn over it by the screen.
export const ResultScenery = memo(function ResultScenery({ width, height }) {
  if (!width || !height) return null;
  const sx = width / 390;
  const sy = height / 260;
  return (
    <View pointerEvents="none" style={[styles.fill, { width, height, backgroundColor: ui.sky }]}>
      <Svg width={width} height={height}>
        <Circle cx={292 * sx} cy={74 * sy} r={46} fill={ui.sun[0]} />
        <Circle cx={292 * sx} cy={74 * sy} r={30} fill={ui.sun[1]} />
        <Ellipse cx={330 * sx} cy={210 * sy} rx={230 * sx} ry={80 * sy} fill={ui.hills[0]} />
        <Ellipse cx={40 * sx} cy={240 * sy} rx={250 * sx} ry={85 * sy} fill={ui.hills[1]} />
        <Ellipse cx={250 * sx} cy={300 * sy} rx={300 * sx} ry={95 * sy} fill={ui.hills[2]} />
        <Pine cx={40} top={128 * sy} big />
        <Pine cx={20} top={150 * sy} />
      </Svg>
    </View>
  );
});

// A pine as the artwork draws them: two stacked triangles on a small rounded trunk.
function Pine({ cx, top, big = false }) {
  const fill = big ? ui.tree : ui.treeDark;
  return big ? (
    <>
      <Path d={`M${cx} ${top}l16 30H${cx - 16}z`} fill={fill} />
      <Path d={`M${cx} ${top + 18}l19 32H${cx - 19}z`} fill={fill} />
      <Rect x={cx - 3} y={top + 50} width={6} height={9} rx={2} fill={ui.trunk} />
    </>
  ) : (
    <>
      <Path d={`M${cx} ${top}l12 22H${cx - 12}z`} fill={fill} />
      <Path d={`M${cx} ${top + 13}l14 24H${cx - 14}z`} fill={fill} />
      <Rect x={cx - 3} y={top + 37} width={6} height={8} rx={2} fill={ui.trunk} />
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },

  copy: {
    position: "absolute",
    left: 0,
    overflow: "hidden", // each copy keeps to its own 700: the hill drawn again at its top must not spill up
  },

  bottom: {
    position: "absolute",
    left: 0,
    bottom: 0,
  },

  cloud: {
    position: "absolute",
    width: 74,
    height: 32,
  },

  puff: {
    position: "absolute",
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },

  cloudBase: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
});

// The course screen's one small white cloud near the top, drifting 14 dp side to side over 9 s
// (still with Reduce Motion). x, y: where it sits, in the path's coordinates.
export function Cloud({ x, y }) {
  const reduce = useReducedMotion();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const half = (toValue) => Animated.timing(drift, { toValue, duration: 4500, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([half(1), half(0)]));
    loop.start();
    return () => loop.stop();
  }, [reduce, drift]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.cloud, { left: x, top: y, transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) }] }]}
    >
      <View style={[styles.puff, { left: 12, top: 0, width: 30, height: 30 }]} />
      <View style={[styles.puff, { left: 36, top: 4, width: 26, height: 26 }]} />
      <View style={styles.cloudBase} />
    </Animated.View>
  );
}
