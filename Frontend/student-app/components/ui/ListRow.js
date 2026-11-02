import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { space, tokens } from "../../theme";
import AppText from "./AppText";

// A plain list row separated by a hairline — the EA alternative to cards.
// left / right are optional elements (an icon, a status, a value).
// `children` renders under the text (e.g. a progress bar).
export default function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  divider = true,
  children,
  accessibilityLabel,
}) {
  const body = (
    <View style={styles.row}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" tone="secondary" style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
        {children}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );

  return (
    <View style={divider && styles.divider}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || title}
          style={({ pressed }) => pressed && styles.pressed}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.lg,
    gap: space.md,
  },

  left: {
    alignItems: "center",
    justifyContent: "center",
  },

  text: {
    flex: 1,
  },

  subtitle: {
    marginTop: 2,
  },

  right: {
    alignItems: "flex-end",
  },

  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },

  pressed: {
    opacity: 0.6,
  },
});
