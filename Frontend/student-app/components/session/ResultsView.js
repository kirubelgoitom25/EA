import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";

import { level, space, tokens, type, ui } from "../../theme";
import AppText from "../ui/AppText";
import { useCountUp } from "../ui/anim";
import { CURVE, MOTION, useReducedMotion } from "../ui/motion";
import { EdgeBox } from "../ui/PressLip";
import { LightScenery } from "../ui/Scenery";
import Button from "../ui/Button";
import Fox from "../ui/Fox";
import Screen from "../ui/Screen";
import ReviewList from "./ReviewList";
import StageTrailMini from "./StageTrailMini";

// The den: the chapter is finished and submitted. The server's score and
// XP, the fox, the full trail behind you, and what to do next.
export default function ResultsView({
  chapterTitle,
  result,
  review,
  stageCount = 1,
  hasNext,
  onNext,
  onRetry,
  onBackToCourse,
  backLabel = "Back to course",
}) {
  const ratio = result.total ? result.score / result.total : 0;
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const xpShown = useCountUp(result.xp > 0 ? result.xp : 0, 1000);

  // the den arrives: scales from 0.92 and fades in (Reduce Motion: a plain fade)
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.timing(enter, { toValue: 1, duration: reduce ? MOTION.fade : 450, easing: CURVE.screen, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [enter, reduce]);
  const enterLook = useMemo(
    () => ({ flex: 1, opacity: enter, transform: [{ scale: reduce ? 1 : enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }),
    [enter, reduce],
  );

  return (
    <Animated.View style={enterLook}>
    <Screen
      background={level.lessonGradient}
      backdrop={<LightScenery width={width} />}
      footer={
        <View>
          <Button label={hasNext ? "Next chapter" : backLabel} onPress={hasNext ? onNext : onBackToCourse} />
          <View style={styles.secondary}>
            <Button label="Try again" variant="text" onPress={onRetry} />
            {hasNext ? <Button label={backLabel} variant="text" onPress={onBackToCourse} /> : null}
          </View>
        </View>
      }
    >
      <View style={styles.hero}>
        <Fox mood={ratio >= 0.5 ? "cheer" : "gentle"} size={168} />

        <AppText variant="overline" tone="secondary" style={styles.chapter}>
          {chapterTitle.toUpperCase()}
        </AppText>
        <AppText variant="display" style={styles.centered}>
          {ratio >= 0.5 ? "You reached the den" : "You made it to the den"}
        </AppText>

        <AppText style={styles.score} accessibilityLabel={`${result.score} out of ${result.total} correct`}>
          {result.score}
          <AppText style={styles.scoreTotal}> / {result.total}</AppText>
        </AppText>
        <AppText tone="secondary">correct</AppText>

        <View style={styles.trail}>
          <StageTrailMini statuses={Array.from({ length: stageCount }, () => "done")} denReached />
        </View>

        <EdgeBox lip={ui.xp.edge} lipSize={3} radius={16} style={styles.xp} faceStyle={styles.xpFace}>
          <AppText variant="title" style={{ color: ui.xp.ink }} accessibilityLabel={result.xp > 0 ? `+${result.xp} XP` : undefined}>
            {result.xp > 0 ? `+${xpShown} XP` : "No new XP this time"}
          </AppText>
        </EdgeBox>
      </View>

      <ReviewList items={review} />
    </Screen>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingTop: space.xl,
  },

  chapter: {
    marginTop: space.lg,
    textAlign: "center",
  },

  centered: {
    textAlign: "center",
    marginTop: space.xs,
  },

  score: {
    ...type.hero,
    color: tokens.text,
    marginTop: space.xl,
  },

  scoreTotal: {
    ...type.display,
    color: tokens.textTertiary,
  },

  trail: {
    marginTop: space.xl,
  },

  xp: {
    marginTop: space.xl,
  },

  xpFace: {
    paddingHorizontal: space.lg + 2,
    paddingVertical: space.sm,
    backgroundColor: ui.xp.bg,
  },

  secondary: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.xxl,
    marginTop: space.xs,
  },
});
