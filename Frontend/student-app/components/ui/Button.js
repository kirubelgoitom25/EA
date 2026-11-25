import React from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { haptic } from "../../services/feedback";
import { edge, fonts, layout, space, tokens, ui } from "../../theme";
import AppText from "./AppText";
import { useReducedMotion } from "./motion";
import PressLip from "./PressLip";
import { usePulse } from "./Skeleton";

// "primary" is the one main action on a screen: a deep green face on a darker edge that sinks when
// pressed. tone="wrong" turns it red (Continue after a wrong answer). "secondary" is a white button
// with a 2 dp border and edge. "text" is for everything else: no fill, no border; tone="danger"
// makes it red (log out). icon puts an Ionicons glyph before the label; invite makes a primary
// button (or a text link, a little more) breathe a few times, then settle — only for the one action a
// screen wants you to take. inviteDelay waits that many ms before the first breath.
export default function Button({
  label,
  onPress,
  variant = "primary",
  tone,
  disabled = false,
  loading = false,
  icon,
  invite = false,
  inviteDelay = 0,
  style,
  accessibilityLabel,
}) {
  const inactive = disabled || loading;
  const reduce = useReducedMotion();

  const breathe = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!invite || inactive || reduce || (variant !== "primary" && variant !== "text")) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      { iterations: 2 },
    );
    const run = inviteDelay > 0 ? Animated.sequence([Animated.delay(inviteDelay), loop]) : loop;
    run.start();
    return () => run.stop();
  }, [invite, inviteDelay, inactive, reduce, variant, breathe]);
  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const linkScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  // While it saves, the label fades softly between 60% and 100% (no spinner); the button takes no taps.
  const pulse = usePulse(loading);

  const handlePress = () => {
    haptic.light();
    onPress?.();
  };

  if (variant === "text") {
    return (
      <Pressable
        onPress={inactive ? undefined : handlePress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        hitSlop={space.sm}
        style={({ pressed }) => [styles.text, pressed && styles.textPressed, style]}
      >
        <Animated.View style={[styles.content, { opacity: pulse, transform: [{ scale: linkScale }] }]}>
          <AppText
            variant="bodyStrong"
            style={{ color: disabled ? tokens.textTertiary : tone === "danger" ? tokens.wrong : tokens.text }}
          >
            {label}
          </AppText>
        </Animated.View>
      </Pressable>
    );
  }

  const look =
    variant === "secondary"
      ? { face: ui.surface, edge: ui.surfaceEdge, ink: tokens.text, border: true }
      : disabled
        ? { face: ui.disabledCta.face, edge: ui.disabledCta.edge, ink: ui.disabledCta.ink }
        : tone === "wrong"
          ? { face: ui.wrongCta.face, edge: ui.wrongCta.edge, ink: "#FFFFFF" }
          : { face: ui.primary, edge: ui.primaryEdge, ink: "#FFFFFF" };

  const button = (
    <PressLip
      onPress={inactive ? undefined : handlePress}
      disabled={inactive}
      lip={look.edge}
      lipSize={edge.cta.depth}
      radius={edge.cta.radius}
      border={look.border}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ busy: loading }}
      style={[styles.stretch, style]}
      faceStyle={[styles.face, { backgroundColor: look.face }]}
    >
      <Animated.View style={[styles.content, { opacity: pulse }]}>
        {icon ? <Ionicons name={icon} size={20} color={look.ink} style={styles.icon} /> : null}
        <AppText variant="bodyStrong" style={[styles.label, { color: look.ink }]}>
          {label}
        </AppText>
      </Animated.View>
    </PressLip>
  );

  if (!invite || inactive || variant !== "primary") return button;
  return <Animated.View style={{ alignSelf: "stretch", transform: [{ scale }] }}>{button}</Animated.View>;
}

// The full height a primary / secondary button takes: its face plus the edge under it.
export const BUTTON_HEIGHT = layout.buttonHeight + edge.cta.depth;

const styles = StyleSheet.create({
  stretch: { alignSelf: "stretch" },

  face: {
    height: layout.buttonHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },

  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },

  icon: { marginTop: 1 },

  label: { fontFamily: fonts.display, letterSpacing: 0.6 },

  text: {
    paddingVertical: space.md,
    alignItems: "center",
    justifyContent: "center",
  },

  textPressed: { opacity: 0.6 },
});
