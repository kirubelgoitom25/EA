import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";

import { stone } from "../../theme";

// The dot grid behind the path screens. Put it as the first child of a scrolling screen's content
// and it fills all of it, however tall, so the grid never breaks or ends. It measures its own box
// (a percentage size would stop at the screen's padding, and would not grow when the content does).
export default function DotGrid({ gap = 44, color = stone.dot }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((now) => (now.width === width && now.height === height ? now : { width, height }));
      }}
    >
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <Pattern id="dots" x="0" y="0" width={gap} height={gap} patternUnits="userSpaceOnUse">
              <Circle cx={gap / 2} cy={gap / 2} r={3} fill={color} />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#dots)" />
        </Svg>
      ) : null}
    </View>
  );
}
