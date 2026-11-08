import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { worldFor } from "./worlds";

// The course card's icon: a flat tile in the course's own colour with a simple open book on it.
// The colour comes from the course (worldFor), the book is dark on the light colours (orange, yellow)
// and white on the rest, as in the design. Used on the Courses cards; the course art elsewhere is
// still <Emblem>.
const DARK_INK = "#3A2410";

export default function CourseIcon({ course, size = 64, radius = 18, style }) {
  const world = worldFor(course?.id);
  const ink = world.on === "#FFFFFF" ? "#FFFFFF" : DARK_INK;
  const glyph = Math.round(size * 0.53); // 34 on a 64 tile

  return (
    <View
      accessible={false}
      style={[{ width: size, height: size, borderRadius: radius, backgroundColor: world.bg, alignItems: "center", justifyContent: "center" }, style]}
    >
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={ink} stroke={ink} strokeWidth={1.5} strokeLinejoin="round">
        <Path d="M3 5a1 1 0 0 1 1-1h5a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4a1 1 0 0 1-1-1z" />
        <Path d="M21 5a1 1 0 0 0-1-1h-5a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h5a1 1 0 0 0 1-1z" />
      </Svg>
    </View>
  );
}
