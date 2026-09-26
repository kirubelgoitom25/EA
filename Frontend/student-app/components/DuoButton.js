import React, { useRef } from "react";
import { Text, StyleSheet, Animated, Pressable } from "react-native";
import { colors, radius } from "../theme";

const VARIANTS = {
  primary: { bg: colors.green, depth: colors.greenDark, text: "#fff" },
  blue: { bg: colors.blue, depth: colors.blueDark, text: "#fff" },
  gold: { bg: colors.gold, depth: colors.goldDark, text: "#4a3900" },
  danger: { bg: colors.red, depth: colors.redDark, text: "#fff" },
  outline: { bg: "#fff", depth: colors.border, text: colors.text },
  disabled: { bg: colors.locked, depth: colors.lockedDark, text: "#9a9a9a" },
};

export default function DuoButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  style,
  icon,
}) {
  const pressAnim = useRef(new Animated.Value(0)).current;
  const scheme = VARIANTS[disabled ? "disabled" : variant];

  const handlePressIn = () => {
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
    outputRange: [0, 3],
  });

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
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

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    height: 54,
    borderRadius: radius.md,
    borderBottomWidth: 4,
    paddingHorizontal: 20,
  },

  label: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
