import React from "react";
import { StyleSheet, View } from "react-native";

import { level, space, tokens, type } from "../../theme";
import AppText from "../ui/AppText";
import Button from "../ui/Button";
import Screen from "../ui/Screen";
import ReviewList from "./ReviewList";
import StageTrailMini from "./StageTrailMini";

// After a stage that isn't the last one left: how it went, where the
// chapter stands on its trail, and what's next. The chapter's official
// score and XP come at the den, once every stage is done.
export default function StageResultView({
  stageNumber,
  summary,
  statuses,
  review,
  nextStageNumber,
  onNextStage,
  onRetry,
  onBackToChapter,
}) {
  const doneCount = statuses.filter((s) => s === "done").length;

  return (
    <Screen
      background={level.lessonBg}
      footer={
        <View>
          {nextStageNumber ? (
            <Button label={`Stage ${nextStageNumber}`} onPress={onNextStage} />
          ) : (
            <Button label="Back to chapter" onPress={onBackToChapter} />
          )}
          <View style={styles.secondary}>
            <Button label="Try again" variant="text" onPress={onRetry} />
            {nextStageNumber ? (
              <Button label="Back to chapter" variant="text" onPress={onBackToChapter} />
            ) : null}
          </View>
        </View>
      }
    >
      <View style={styles.hero}>
        <StageTrailMini statuses={statuses} />

        <AppText variant="overline" tone="secondary" style={styles.overline}>
          STAGE {stageNumber} COMPLETE
        </AppText>

        {summary.graded > 0 ? (
          <AppText style={styles.score} accessibilityLabel={`${summary.correct} of ${summary.graded} correct`}>
            {summary.correct}
            <AppText style={styles.scoreTotal}> / {summary.graded}</AppText>
          </AppText>
        ) : null}
        {summary.graded > 0 ? (
          <AppText tone="secondary">correct</AppText>
        ) : null}

        {summary.saved > 0 ? (
          <AppText tone="secondary" style={styles.centered}>
            {summary.saved} fill-in {summary.saved === 1 ? "answer" : "answers"} saved
          </AppText>
        ) : null}

        <AppText variant="caption" tone="secondary" style={styles.caption}>
          {doneCount} of {statuses.length} stages · Score and XP at the den
        </AppText>
      </View>

      <ReviewList items={review} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingTop: space.xxl,
  },

  overline: {
    marginTop: space.xl,
  },

  score: {
    ...type.hero,
    color: tokens.text,
    marginTop: space.sm,
  },

  scoreTotal: {
    ...type.display,
    color: tokens.textTertiary,
  },

  centered: {
    textAlign: "center",
    marginTop: space.sm,
  },

  caption: {
    marginTop: space.lg,
    textAlign: "center",
  },

  secondary: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.xxl,
    marginTop: space.xs,
  },
});
