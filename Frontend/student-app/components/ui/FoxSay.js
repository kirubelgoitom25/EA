import React from "react";
import { StyleSheet, View } from "react-native";

import { layout, space, tokens } from "../../theme";
import AppText from "./AppText";
import { Entrance } from "./anim";
import Fox from "./Fox";

// The fox says one short thing. Use it at most once per screen, where a word of guidance or
// encouragement helps; it is not decoration. The fox sits on the screen background (its artwork's
// background is exactly tokens.bg).
export default function FoxSay({ children, delay = 150, style }) {
  return (
    <Entrance delay={delay} distance={12} style={[styles.row, style]}>
      <Fox pose="head" size={52} decorative />
      <View style={styles.bubble} accessibilityRole="text">
        <View style={styles.tip} />
        <AppText variant="bodyStrong">{children}</AppText>
      </View>
    </Entrance>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  bubble: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: layout.tileRadius,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.divider,
  },
  // The little point of the speech bubble, toward the fox.
  tip: {
    position: "absolute",
    left: -6,
    top: "50%",
    marginTop: -6,
    width: 12,
    height: 12,
    backgroundColor: tokens.surface,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: tokens.divider,
    transform: [{ rotate: "45deg" }],
  },
});
