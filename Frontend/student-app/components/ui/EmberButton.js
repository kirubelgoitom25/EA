import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { haptic } from "../../services/feedback";
import { edge, fonts, layout, space, tokens, ui } from "../../theme";
import AppText from "./AppText";
import PressLip, { EdgeBox } from "./PressLip";

// The journey's action (Start Journey, See my journey): the primary green face on its darker edge,
// with an arrow after the label; it sinks when pressed like every other button. decorative draws it
// as a plain shape inside something that is already pressable (a route card).
export default function EmberButton({ label, onPress, icon = "arrow-forward", decorative = false, compact = false, style }) {
  const height = compact ? 48 : layout.buttonHeight;
  const body = (
    <View style={styles.content}>
      <AppText variant="bodyStrong" style={styles.label}>
        {label}
      </AppText>
      <Ionicons name={icon} size={20} color="#FFFFFF" />
    </View>
  );
  const face = [styles.face, { height }];
  if (decorative) {
    return (
      <EdgeBox lip={ui.primaryEdge} lipSize={edge.cta.depth} radius={edge.cta.radius} faceStyle={face} style={style}>
        {body}
      </EdgeBox>
    );
  }
  return (
    <PressLip
      onPress={() => {
        haptic.light();
        onPress?.();
      }}
      accessibilityLabel={label}
      lip={ui.primaryEdge}
      lipSize={edge.cta.depth}
      radius={edge.cta.radius}
      style={[styles.stretch, style]}
      faceStyle={face}
    >
      {body}
    </PressLip>
  );
}

const styles = StyleSheet.create({
  stretch: { alignSelf: "stretch" },
  face: {
    backgroundColor: ui.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  content: { flexDirection: "row", alignItems: "center", gap: space.sm },
  label: { color: tokens.onAccent, letterSpacing: 0.4, fontFamily: fonts.display },
});
