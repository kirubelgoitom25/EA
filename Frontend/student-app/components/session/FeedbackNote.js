import React, { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, tokens, ui } from "../../theme";
import AppText from "../ui/AppText";
import { CURVE, MOTION, popTiming, useReducedMotion } from "../ui/motion";

// What each verdict looks like: the sheet's colours, its icon tile and its title.
export const VERDICTS = {
  correct: { title: "Correct!", icon: "checkmark", sheet: ui.correctSheet, tile: ui.correct.face, tileEdge: ui.correct.edge },
  wrong: { title: "Not quite", icon: "close", sheet: ui.wrongSheet, tile: ui.wrongCta.face, tileEdge: ui.wrongCta.edge },
  saved: {
    title: "Saved",
    icon: "bookmark",
    sheet: { bg: tokens.mist, border: ui.surfaceEdge, title: tokens.text, body: ui.textSecondary },
    tile: ui.primary,
    tileEdge: ui.primaryEdge,
  },
};

// The feedback sheet's words, shown once a question is checked: an icon tile (it pops in just after
// the sheet), the verdict and the explanation. It rises into the session's footer, which tints itself
// in the sheet's colour so the sheet and the button read as one panel. Long explanations scroll.
export default function FeedbackNote({ verdict, note, explanation }) {
  const reduce = useReducedMotion();
  const rise = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const look = VERDICTS[verdict] ?? VERDICTS.saved;

  useEffect(() => {
    if (reduce) {
      rise.setValue(0);
      pop.setValue(1);
      const fade = Animated.timing(rise, { toValue: 1, duration: MOTION.fade, useNativeDriver: true });
      fade.start();
      return () => fade.stop();
    }
    const run = Animated.parallel([
      Animated.timing(rise, { toValue: 1, duration: MOTION.rise, easing: CURVE.rise, useNativeDriver: true }),
      popTiming(pop, { delay: 150 }),
    ]);
    run.start();
    return () => run.stop();
  }, [rise, pop, reduce]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.sheet,
        {
          opacity: rise.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: [{ translateY: reduce ? 0 : rise.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }],
        },
      ]}
    >
      <View style={styles.head}>
        <Animated.View
          style={[styles.iconBox, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
        >
          <View style={[styles.iconLip, { backgroundColor: look.tileEdge }]} />
          <View style={[styles.icon, { backgroundColor: look.tile }]}>
            <Ionicons name={look.icon} size={22} color="#FFFFFF" />
          </View>
        </Animated.View>
        <AppText style={[styles.title, { color: look.sheet.title }]} accessibilityRole="header">
          {look.title}
        </AppText>
      </View>
      {note || explanation ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {note ? <AppText style={[styles.body, { color: look.sheet.body }]}>{note}</AppText> : null}
          {explanation ? <AppText style={[styles.body, { color: look.sheet.body }]}>{explanation}</AppText> : null}
        </ScrollView>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingBottom: 14,
  },

  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  iconBox: {
    width: 36,
    height: 39,
  },

  iconLip: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 3,
    height: 36,
    borderRadius: 11,
  },

  icon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontFamily: fonts.display,
    fontSize: 16,
    lineHeight: 22,
  },

  scroll: {
    maxHeight: 132,
    marginTop: 8,
  },

  body: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
});
