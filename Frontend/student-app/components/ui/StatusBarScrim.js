import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tokens } from "../../theme";

// On screens whose banner runs under the status bar, this strip appears
// once the content scrolls, so text never sits under the clock and icons.
export default function StatusBarScrim({ visible, color }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return <View pointerEvents="none" style={[styles.scrim, { height: insets.top }, color && { backgroundColor: color }]} />;
}

// Scroll handler factory: calls set(true/false) when crossing `threshold`.
export const scrimOnScroll = (threshold, current, set) => (event) => {
  const past = event.nativeEvent.contentOffset.y > threshold;
  if (past !== current) set(past);
};

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },
});
