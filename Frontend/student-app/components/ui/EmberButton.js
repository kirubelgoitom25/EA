import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { haptic } from "../../services/feedback";
import { layout, space, tokens } from "../../theme";
import AppText from "./AppText";

// The signature action: fox ember with dark ink (white on ember fails contrast) and a pressed-in lip.
// Used for the one action that moves the journey on (Start Journey, Continue). decorative draws it
// as a plain View inside something that is already pressable (a route card).
export default function EmberButton({ label, onPress, icon = "arrow-forward", decorative = false, compact = false, style }) {
  const height = compact ? 48 : layout.buttonHeight;
  const body = (
    <>
      <AppText variant="bodyStrong" style={styles.label}>
        {label}
      </AppText>
      <Ionicons name={icon} size={20} color={tokens.onAccent} />
    </>
  );
  const base = [styles.ember, { height, borderRadius: layout.radius }, style];
  if (decorative) return <View style={base}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ember: {
    backgroundColor: tokens.accent,
    borderBottomWidth: 5,
    borderBottomColor: tokens.accentLip,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  pressed: { backgroundColor: tokens.accentPressed, borderBottomWidth: 0, marginTop: 5 },
  label: { color: tokens.onAccent, letterSpacing: 0.4 },
});
