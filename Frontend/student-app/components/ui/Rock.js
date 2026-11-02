import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Ellipse, Path } from "react-native-svg";

import { stone, tokens } from "../../theme";

// A stepping stone, drawn as a pebble: a darker edge, the face, a shaded side, and a lighter facet
// on top. No shadow on the ground. Three outlines, picked by the step's place on the path, so no two neighbours match.
// `size` is the rock's width; the picture has room around it for the ring of the rock you are on.
const OUTLINES = [
  "M14 62 C10 44 22 22 44 16 C62 11 84 22 88 44 C92 62 80 76 56 78 C34 80 18 76 14 62 Z",
  "M10 58 C8 38 26 18 50 14 C72 12 92 30 90 54 C89 70 70 80 48 80 C26 80 11 72 10 58 Z",
  "M16 66 C8 48 18 26 40 18 C60 10 86 20 90 42 C94 62 78 78 52 80 C32 82 20 76 16 66 Z",
];
const FACET = "M24 50 C24 36 36 26 52 24 C68 22 80 32 80 44 C66 40 40 42 24 50 Z";
// a shaded side, so it reads as a stone and not a blob
const SIDE = "M58 79 C80 76 92 62 90 44 C88 36 84 30 80 28 C84 44 78 62 58 70 Z";

// What a rock looks like in each state.
export const ROCKS = {
  done: { face: stone.moss, edge: stone.mossEdge, light: stone.mossLight, ink: "#FFFFFF" },
  next: { face: stone.here, edge: stone.hereEdge, light: "#FFFFFF", ink: tokens.text },
  todo: { face: stone.rock, edge: stone.rockEdge, light: stone.rockLight, ink: stone.rockInk },
};

// How big the picture is, and where the rock's middle is in it, for a rock `size` wide.
export const rockBox = (size) => ({ width: size * 1.16, height: size * 1.16, cx: size * 0.58, cy: size * 0.55 });

export default function Rock({ status = "todo", size = 80, variant = 0, icon, children, ring = false }) {
  const look = ROCKS[status] ?? ROCKS.todo;
  const box = rockBox(size);
  const outline = OUTLINES[variant % OUTLINES.length];
  return (
    <View style={{ width: box.width, height: box.height }}>
      <Svg width={box.width} height={box.height} viewBox="-8 -8 116 116">
        {ring ? <Ellipse cx={50} cy={50} rx={51} ry={46} fill="none" stroke={tokens.accent} strokeWidth={4} /> : null}
        <Path d={outline} fill={look.edge} transform="translate(0 7)" />
        <Path d={outline} fill={look.face} />
        <Path d={SIDE} fill={look.edge} opacity={0.45} />
        <Path d={FACET} fill={look.light} opacity={0.4} />
      </Svg>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: size * 1.0, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
        {icon ? <Ionicons name={icon} size={size * 0.36} color={look.ink} /> : children}
      </View>
    </View>
  );
}

// A dome (the den): the end of a part, and of the course. Always slate blue, a colour no rock has, so
// it is easy to spot. Pale and shut ahead; once you arrive it is deep blue with its door lit.
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
