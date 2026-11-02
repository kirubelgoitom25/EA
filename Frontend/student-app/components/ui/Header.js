import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { space, tokens } from "../../theme";
import AppText from "./AppText";

// The one header pattern used on every screen:
// - an optional back link ("‹ Courses") above
// - a large title, with an optional subtitle under it
// - an optional element on the right of the title (e.g. a count)
export default function Header({ title, subtitle, backLabel, onBack, right }) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={space.md}
          accessibilityRole="button"
          accessibilityLabel={backLabel ? `Back to ${backLabel}` : "Go back"}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Feather name="arrow-left" size={18} color={tokens.textSecondary} />
          {backLabel ? (
            <AppText variant="label" tone="secondary">
              {backLabel}
            </AppText>
          ) : null}
        </Pressable>
      ) : null}

      {title ? (
        <View style={styles.titleRow}>
          <AppText variant="display" style={styles.title} accessibilityRole="header">
            {title}
          </AppText>
          {right}
        </View>
      ) : null}

      {subtitle ? (
        <AppText tone="secondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space.xl,
  },

  back: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: space.lg,
    marginLeft: -space.xs,
  },

  pressed: {
    opacity: 0.6,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },

  title: {
    flexShrink: 1,
  },

  subtitle: {
    marginTop: space.xs,
  },
});
