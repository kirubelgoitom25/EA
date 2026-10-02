import React, { useMemo, useRef } from "react";
import { Text, StyleSheet, Animated, Pressable } from "react-native";
import { haptic } from "../services/feedback";
import { radius, useTheme } from "../theme";

const getVariants = (colors) => ({
  primary: { bg: colors.orange, depth: colors.orangeDeep, text: "#fff" },
  blue: { bg: colors.blue, depth: colors.blueDark, text: "#fff" },
  gold: { bg: colors.yellow, depth: colors.yellowDeep, text: "#533400" },
  danger: { bg: colors.red, depth: colors.redDark, text: "#fff" },
  outline: { bg: colors.card, depth: colors.border, text: colors.text },
  secondary: { bg: colors.card, depth: colors.border, text: colors.text },
  success: { bg: colors.mint, depth: "#2AAE72", text: "#fff" },
  warning: { bg: colors.yellow, depth: colors.yellowDeep, text: "#533400" },
  disabled: { bg: colors.locked, depth: colors.lockedDark, text: "#726964" },
});

export default function DuoButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  hapticEnabled = true,
  style,
  icon,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const variants = getVariants(colors);
  const pressAnim = useRef(new Animated.Value(0)).current;
  const scheme = variants[disabled ? "disabled" : variant] || variants.primary;

  const handlePressIn = () => {
    if (disabled) {
      return;
    }

    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressAnim, {
      toValue: 0,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const translateY = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2],
  });

  return (
    <Pressable
      onPress={disabled || !onPress ? undefined : (event) => {
        if (hapticEnabled) haptic.light();
        onPress(event);
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={styles.pressable}
    >
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: scheme.bg,
            borderBottomColor: scheme.depth,
            transform: [{ translateY }],
          },
          style,
        ]}
      >
        {icon}
        <Text style={[styles.label, { color: scheme.text }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const createStyles = (colors) => StyleSheet.create({
  pressable: {
    alignSelf: "stretch",
  },

  button: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    minHeight: 56,
    borderRadius: radius.full,
    borderBottomWidth: 4,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },

  label: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
