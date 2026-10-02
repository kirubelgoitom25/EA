import React, { useMemo } from "react";
import { View, Text, Switch, StyleSheet } from "react-native";

import { useTheme } from "../theme";
import { feedback, useFeedbackSettings } from "../services/feedback";

// Drop <FeedbackSettings /> into the Profile screen.
export default function FeedbackSettings() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { sound, haptics } = useFeedbackSettings();

  const onSound = (value) => {
    feedback.setSoundEnabled(value);
    if (value) feedback.button(); // small preview
  };

  const onHaptics = (value) => {
    feedback.setHapticsEnabled(value);
    if (value) feedback.button(); // small preview
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Sound Effects</Text>
        <Switch
          value={sound}
          onValueChange={onSound}
          trackColor={{ true: colors.green }}
        />
      </View>

      <View style={[styles.row, styles.rowLast]}>
        <Text style={styles.label}>Haptic Feedback</Text>
        <Switch
          value={haptics}
          onValueChange={onHaptics}
          trackColor={{ true: colors.green }}
        />
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      paddingHorizontal: 16,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    label: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
    },
  });
