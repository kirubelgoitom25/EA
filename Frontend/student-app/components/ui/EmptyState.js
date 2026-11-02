import React from "react";
import { StyleSheet, View } from "react-native";

import { space } from "../../theme";
import AppText from "./AppText";
import Button from "./Button";
import Fox from "./Fox";

// Fox + short message + optional single action. Used for "nothing here
// yet", errors and finished states, so they all look the same.
export default function EmptyState({
  title,
  message,
  pose = "standing",
  actionLabel,
  actionIcon,
  invite = false,
  onAction,
}) {
  return (
    <View style={styles.wrap}>
      <Fox pose={pose} mood={pose === "waving" ? "greeting" : "curious"} size={140} decorative />
      <AppText variant="title" style={styles.title}>
        {title}
      </AppText>
      {message ? (
        <AppText tone="secondary" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} icon={actionIcon} invite={invite} onPress={onAction} style={[styles.action, (actionIcon || invite) && styles.actionPill]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: space.xxl,
  },

  title: {
    marginTop: space.lg,
    textAlign: "center",
  },

  message: {
    marginTop: space.sm,
    textAlign: "center",
  },

  action: {
    marginTop: space.xl,
  },

  // A compact, centered pill instead of a full-width bar.
  actionPill: {
    alignSelf: "center",
    paddingHorizontal: space.xxl,
  },
});
