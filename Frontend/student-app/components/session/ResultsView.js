import React from "react";
import { StyleSheet, View } from "react-native";

import { space, tokens, type } from "../../theme";
import AppText from "../ui/AppText";
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

  return (
    <Screen
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

        <View style={styles.xp}>
          <AppText variant="title" tone="accent">
            {result.xp > 0 ? `+${result.xp} XP` : "No new XP this time"}
          </AppText>
        </View>
      </View>

      <ReviewList items={review} />
    </Screen>
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
    paddingHorizontal: space.lg + 2,
    paddingVertical: space.sm,
    borderRadius: 20,
    backgroundColor: tokens.accentTint,
  },

  secondary: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.xxl,
    marginTop: space.xs,
  },
});
