import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";

import { feedback, haptic } from "../../services/feedback";
import { fonts, level, space, tokens, ui } from "../../theme";
import AppText from "../ui/AppText";
import { useCountUp } from "../ui/anim";
import Button from "../ui/Button";
import { CURVE, MOTION, popTiming, useReducedMotion } from "../ui/motion";
import { EdgeBox } from "../ui/PressLip";
import { Dome } from "../ui/Rock";
import { LightScenery, ResultScenery } from "../ui/Scenery";
import Screen from "../ui/Screen";
import ReviewList from "./ReviewList";
import StageTrailMini from "./StageTrailMini";

const SCENE = 210; // the scenery panel at the top
const CARD_START = 300; // ms before the first card (score) pops
const CARD_STEP = 300; // ms between the cards: score, stages, best streak
const GOOD = 0.8; // from this score up the main button is nudged; below it, Try again is
const NUDGE_AT = CARD_START + 2 * CARD_STEP + 500; // ms: after the last card has landed

// After a stage that isn't the last one left: a little scene, how it went (score, best
// run of right answers, stages done), where the chapter stands on its stepper, and what's next. The
// chapter's official score and XP come at the den, once every stage is done.
export default function StageResultView({
  stageNumber,
  summary,
  streak = 0,
  statuses,
  review,
  nextStageNumber,
  onNextStage,
  onRetry,
  onBackToChapter,
}) {
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const scroll = useRef(null);
  const doneCount = statuses.filter((s) => s === "done").length;
  const ratio = summary.graded ? summary.correct / summary.graded : 1;
  const good = ratio >= GOOD;

  // the screen arrives: scales from 0.92 and fades in (Reduce Motion: a plain fade)
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

  const correctShown = useCountUp(summary.correct, 1000);

  return (
    <Animated.View style={enterLook}>
      <Screen
        background={level.lessonGradient}
      backdrop={<LightScenery width={width} />}
        scrollRef={scroll}
        contentStyle={styles.content}
        footer={
          <View>
            {nextStageNumber ? (
              <Button label={`Start stage ${nextStageNumber}`} onPress={onNextStage} invite={good} inviteDelay={NUDGE_AT} />
            ) : (
              <Button label="Back to chapter" onPress={onBackToChapter} invite={good} inviteDelay={NUDGE_AT} />
            )}
            {review.length ? (
              <View style={styles.secondaryButton}>
                <Button label="Review answers" variant="secondary" onPress={() => scroll.current?.scrollToEnd({ animated: !reduce })} />
              </View>
            ) : null}
            <View style={styles.links}>
              <Button label="Try again" variant="text" onPress={onRetry} invite={!good} inviteDelay={NUDGE_AT} />
              {nextStageNumber ? <Button label="Back to chapter" variant="text" onPress={onBackToChapter} /> : null}
            </View>
          </View>
        }
      >
        <View style={[styles.scene, { width }]}>
          <ResultScenery width={width} height={SCENE} />
          <View style={styles.denSpot}>
            <Dome size={64} lit={false} />
          </View>
        </View>

        <View style={styles.hero}>
          <AppText style={styles.eyebrow}>STAGE {stageNumber} COMPLETE</AppText>
          <AppText style={styles.headline} accessibilityRole="header">
            {ratio >= 0.5 ? "Nice work!" : "Stage done"}
          </AppText>

          <View style={styles.stepper}>
            <StageTrailMini statuses={statuses} pop={stageNumber - 1} />
          </View>

          <View style={styles.cards}>
            <StatCard
              order={0}
              label="SCORE"
              value={summary.graded > 0 ? `${correctShown}/${summary.graded}` : "Saved"}
              colors={ui.xp}
              accessibilityLabel={summary.graded > 0 ? `${summary.correct} of ${summary.graded} correct` : `${summary.saved} answers saved`}
            />
            <StatCard
              order={1}
              label="STAGES"
              value={`${doneCount}/${statuses.length}`}
              colors={ui.streak}
              accessibilityLabel={`${doneCount} of ${statuses.length} stages done`}
            />
            <StatCard
              order={2}
              label="BEST STREAK"
              value={String(streak)}
              colors={ui.trophy}
              accessibilityLabel={`Best streak ${streak} in a row`}
            />
          </View>

          {summary.saved > 0 && summary.graded > 0 ? (
            <AppText tone="secondary" style={styles.centered}>
              {summary.saved} fill-in {summary.saved === 1 ? "answer" : "answers"} saved
            </AppText>
          ) : null}

          <AppText variant="caption" tone="secondary" style={styles.caption}>
            Score and XP at the den
          </AppText>
        </View>

        <ReviewList items={review} />
      </Screen>
    </Animated.View>
  );
}

// A white card with a 2 dp border and 5 dp edge in its chip colours, a small uppercase label and a big
// value. Cards pop in 300 ms apart, each with a beat that is a little stronger than the one before.
function StatCard({ order, label, value, colors, accessibilityLabel }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    const delay = CARD_START + order * CARD_STEP;
    const beat = setTimeout(() => {
      feedback.stat(order);
      haptic.rise(order);
    }, delay);
    if (reduce) return () => clearTimeout(beat);
    const run = popTiming(v, { delay });
    run.start();
    return () => {
      clearTimeout(beat);
      run.stop();
    };
  }, [v, order, reduce]);
  return (
    <Animated.View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, { opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
    >
      <EdgeBox lip={colors.edge} lipSize={5} radius={18} border faceStyle={styles.cardFace}>
        <AppText style={[styles.cardLabel, { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </AppText>
        <AppText style={styles.cardValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </AppText>
      </EdgeBox>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 0,
  },

  scene: {
    height: SCENE,
    marginHorizontal: -space.xl,
    overflow: "hidden",
  },

  denSpot: {
    position: "absolute",
    right: 56,
    bottom: 22,
  },

  hero: {
    alignItems: "center",
    paddingTop: space.xl,
  },

  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    color: level.label,
  },

  headline: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
    color: tokens.text,
    marginTop: space.xs,
  },

  stepper: {
    marginTop: space.xl,
  },

  cards: {
    flexDirection: "row",
    gap: 10,
    marginTop: space.xl,
    alignSelf: "stretch",
  },

  card: {
    flex: 1,
  },

  cardFace: {
    backgroundColor: ui.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },

  cardLabel: {
    fontFamily: fonts.display,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
  },

  cardValue: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 30,
    color: tokens.text,
    marginTop: 4,
  },

  centered: {
    textAlign: "center",
    marginTop: space.lg,
  },

  caption: {
    marginTop: space.md,
    textAlign: "center",
  },

  secondaryButton: {
    marginTop: space.md,
  },

  links: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.xxl,
    marginTop: space.xs,
  },
});
