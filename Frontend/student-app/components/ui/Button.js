import React from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { haptic } from "../../services/feedback";
import { fonts, layout, space, tokens } from "../../theme";
import AppText from "./AppText";
import { usePulse } from "./Skeleton";

// "primary" is the one main action on a screen: an ember pill with a
// dark ink label and a lip that presses in. "text" is for everything else — no
// fill, no border. tone="danger" makes a text button red (log out).
// icon puts an Ionicons glyph before the label; invite makes a primary button
// breathe a few times, then settle — only for the one action a screen wants
// you to take.
export default function Button({
  label,
  onPress,
  variant = "primary",
  tone,
  disabled = false,
  loading = false,
  icon,
  invite = false,
  style,
  accessibilityLabel,
}) {
  const isPrimary = variant === "primary";
  const inactive = disabled || loading;

  const breathe = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!invite || inactive) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      { iterations: 2 },
    );
    loop.start();
    return () => loop.stop();
  }, [invite, inactive, breathe]);
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  // While it saves, the label fades softly between 60% and 100% (no spinner); the button takes no taps.
  const pulse = usePulse(loading);

  const handlePress = () => {
    haptic.light();
    onPress?.();
  };

  const button = (
    <Pressable
      onPress={inactive ? undefined : handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={isPrimary ? undefined : space.sm}
      style={({ pressed }) => [
        isPrimary ? styles.primary : styles.text,
        isPrimary && pressed && styles.primaryPressed,
        isPrimary && disabled && styles.primaryDisabled,
        !isPrimary && pressed && styles.textPressed,
        style,
      ]}
    >
      <Animated.View style={[styles.content, { opacity: pulse }]}>
          {icon ? <Ionicons name={icon} size={20} color={tokens.onAccent} style={styles.icon} /> : null}
          <AppText
            variant="bodyStrong"
            style={{
              color: disabled
                ? tokens.textTertiary
                : isPrimary
                  ? tokens.onAccent
                  : tone === "danger"
                    ? tokens.wrong
                    : tokens.text,
              ...(isPrimary && { letterSpacing: 0.6, fontFamily: fonts.display }),
            }}
          >
            {label}
          </AppText>
      </Animated.View>
    </Pressable>
  );

  if (!invite || inactive) return button;
  return <Animated.View style={{ alignSelf: "center", transform: [{ scale }] }}>{button}</Animated.View>;
}

const LIP = 5;

const styles = StyleSheet.create({
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  primary: {
    height: layout.buttonHeight,
    borderRadius: layout.radius,
    backgroundColor: tokens.accent,
    borderBottomWidth: LIP,
    borderBottomColor: tokens.accentLip,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    alignSelf: "stretch",
    flexDirection: "row",
    gap: space.sm,
  },

  icon: {
    marginTop: 1,
  },

  // Pressed: the lip folds away and the face drops into its place.
  primaryPressed: {
    backgroundColor: tokens.accentPressed,
    borderBottomWidth: 0,
    marginTop: LIP,
    height: layout.buttonHeight - LIP,
  },

  primaryDisabled: {
    backgroundColor: tokens.divider,
    borderBottomColor: tokens.divider,
  },

  text: {
    paddingVertical: space.md,
    alignItems: "center",
    justifyContent: "center",
  },

  textPressed: {
    opacity: 0.6,
  },
});
