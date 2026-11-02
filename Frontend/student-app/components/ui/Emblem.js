import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, G, Path, Polygon } from "react-native-svg";

import { TAIL, tokens } from "../../theme";
import { subjectFor } from "./subjects";
import { worldFor } from "./worlds";

// A course's art: a rounded tile in the course's world colour, a pattern, and the subject's glyph.
// It is the one picture of a course, the same on every screen (the Courses cards, the course page,
// the introduction and finale, the chapter header, the path's den); only its size changes. Give it
// `size` for a square, or `width` and `height` for a card. Everything is drawn here (no pictures),
// so it is sharp at any size. At `progress` 1 (the course is done) a seal appears on it.
export default function Emblem({ course, size = 96, width, height, radius, progress, style }) {
  const world = worldFor(course?.id);
  const subject = subjectFor(course?.title);
  const w = width ?? size;
  const h = height ?? size;
  const short = Math.min(w, h);
  const corner = radius ?? Math.round(short * 0.28);
  const glyph = short * 0.5;
  const done = typeof progress === "number" && progress >= 1;
  const seal = Math.max(24, short * 0.34);

  return (
    <View style={[{ width: w, height: h }, style]}>
      <View style={{ width: w, height: h, borderRadius: corner, overflow: "hidden", backgroundColor: world.bg }}>
        <Svg width={w} height={h} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
          <Pattern world={world} />
        </Svg>
        <View style={styles.glyph}>
          {/* a darker copy underneath gives the glyph a little depth */}
          <View style={{ width: glyph, height: glyph }}>
            <MaterialCommunityIcons name={subject.icon} size={glyph} color={world.shade} style={{ position: "absolute", top: glyph * 0.05, left: glyph * 0.04 }} />
            <MaterialCommunityIcons name={subject.icon} size={glyph} color={world.on} />
          </View>
        </View>
      </View>

      {done ? (
        <LinearGradient
          colors={TAIL}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.seal, { width: seal, height: seal, borderRadius: seal / 2, right: -seal * 0.18, bottom: -seal * 0.18 }]}
        >
          <Ionicons name="checkmark" size={seal * 0.58} color={tokens.onAccent} />
        </LinearGradient>
      ) : null}
    </View>
  );
}

// The pattern behind the glyph, drawn on a 100 x 100 board. Soft tints only: the glyph stays the hero.
function Pattern({ world }) {
  const { tint, shade, pattern } = world;
  if (pattern === "rings") {
    return (
      <G>
        <Circle cx={84} cy={16} r={78} fill={shade} opacity={0.3} />
        <Circle cx={84} cy={16} r={58} fill={tint} opacity={0.3} />
        <Circle cx={84} cy={16} r={38} fill={shade} opacity={0.3} />
        <Circle cx={84} cy={16} r={18} fill={tint} opacity={0.45} />
      </G>
    );
  }
  if (pattern === "dots") {
    const dots = [];
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        dots.push(<Circle key={`${row}-${col}`} cx={8 + col * 18 + (row % 2) * 9} cy={8 + row * 18} r={3.6} fill={tint} opacity={0.75} />);
      }
    }
    return <G>{dots}</G>;
  }
  if (pattern === "waves") {
    return (
      <G fill="none" stroke={tint} strokeWidth={6} strokeLinecap="round" opacity={0.65}>
        {[22, 42, 62, 82].map((y) => (
          <Path key={y} d={`M-10 ${y} C 12 ${y - 14}, 30 ${y + 14}, 50 ${y} S 88 ${y - 14}, 110 ${y}`} />
        ))}
      </G>
    );
  }
  if (pattern === "rays") {
    const wedges = [];
    for (let i = 0; i < 9; i += 2) {
      const a1 = (i * Math.PI) / 18 - 0.02;
      const a2 = ((i + 1) * Math.PI) / 18 + 0.02;
      const pt = (a) => `${(180 * Math.cos(a)).toFixed(1)},${(100 - 180 * Math.sin(a)).toFixed(1)}`;
      wedges.push(<Polygon key={i} points={`0,100 ${pt(a1)} ${pt(a2)}`} fill={tint} opacity={0.42} />);
    }
    return <G>{wedges}</G>;
  }
  // scales
  const scales = [];
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      scales.push(<Circle key={`${row}-${col}`} cx={col * 24 + (row % 2) * 12} cy={10 + row * 16} r={17} fill="none" stroke={shade} strokeWidth={3} opacity={0.45} />);
    }
  }
  return <G>{scales}</G>;
}

const styles = StyleSheet.create({
  glyph: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  seal: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: tokens.surface,
  },
});
