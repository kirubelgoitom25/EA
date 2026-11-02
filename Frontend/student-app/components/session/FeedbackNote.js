import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { motion, space, tokens } from "../../theme";
import AppText from "../ui/AppText";
import { useReducedMotion } from "../ui/motion";

const VERDICTS = {
  correct: { title: "Correct", tone: "correct" },
  wrong: { title: "Not quite", tone: "wrong" },
  saved: { title: "Saved", tone: "secondary" },
};

// Unfolds under the answers once the student has answered: the verdict and
// the explanation. (The answer itself is already shown in the tiles and the
// filled-in blank.)
export default function FeedbackNote({ verdict, note, explanation }) {
  const reduceMotion = useReducedMotion();
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const look = VERDICTS[verdict] ?? VERDICTS.saved;

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(enter, {
      toValue: 1,
      duration: motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enter, reduceMotion]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.note,
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      <AppText variant="bodyStrong" tone={look.tone}>
        {look.title}
      </AppText>
      {note ? (
        <AppText tone="secondary" style={styles.line}>
          {note}
        </AppText>
      ) : null}
      {explanation ? <AppText style={styles.line}>{explanation}</AppText> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: space.xl,
    padding: space.lg + 2,
    borderRadius: 22,
    backgroundColor: tokens.mist,
  },

  line: {
    marginTop: space.xs + 2,
  },
});
