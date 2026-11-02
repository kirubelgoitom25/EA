import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { space, tokens } from "../../theme";
import AppText from "../ui/AppText";

// The choice questions answered wrong, with the right answer and the
// explanation — shown under a stage or chapter result.
export default function ReviewList({ items }) {
  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="overline" tone="secondary" style={styles.title}>
        REVIEW
      </AppText>
      {items.map((item, index) => (
        <View key={item.key} style={[styles.item, index < items.length - 1 && styles.divider]}>
          <AppText variant="bodyStrong">{item.prompt}</AppText>
          <View style={styles.line}>
            <Ionicons name="close-circle" size={16} color={tokens.wrong} />
            <AppText variant="label" tone="secondary">{item.yourAnswer}</AppText>
          </View>
          <View style={styles.line}>
            <Ionicons name="checkmark-circle" size={16} color={tokens.correct} />
            <AppText variant="label" tone="correct">{item.correctAnswer}</AppText>
          </View>
          {item.explanation ? (
            <AppText tone="secondary" style={styles.explanation}>
              {item.explanation}
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.xxxl,
  },

  title: {
    marginBottom: space.xs,
  },

  item: {
    paddingVertical: space.lg,
    gap: space.xs,
  },

  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
  },

  explanation: {
    marginTop: space.xs,
  },

  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },
});
