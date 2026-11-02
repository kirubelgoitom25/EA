import React from "react";
import { Text } from "react-native";

import { tokens, type } from "../../theme";

const TONES = {
  primary: tokens.text,
  secondary: tokens.textSecondary,
  tertiary: tokens.textTertiary,
  accent: tokens.accentText,
  correct: tokens.correct,
  wrong: tokens.wrongText,
  onAccent: tokens.onAccent,
  onPlum: tokens.onPlum,
  onPlumSecondary: tokens.onPlumSecondary,
};

// Text in the EA type scale. Hierarchy comes from `variant` and `tone`,
// not from boxes around content.
export default function AppText({
  variant = "body",
  tone = "primary",
  style,
  children,
  ...rest
}) {
  return (
    <Text style={[type[variant], { color: TONES[tone] }, style]} {...rest}>
      {children}
    </Text>
  );
}
