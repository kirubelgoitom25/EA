import React from "react";
import { StyleSheet, View } from "react-native";

import { tailAt, tokens } from "../../theme";
import Stone from "../ui/Stone";

// A compact trail for results screens: one small stone per stage, joined
// by short Tail links, ending at the den. denReached fills the den in plum.
export default function StageTrailMini({ statuses, denReached = false }) {
  const n = statuses.length;
  const colorAt = (i) => tailAt(n <= 1 ? 0 : i / n);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${statuses.filter((s) => s === "done").length} of ${n} stages done`}
    >
      {statuses.map((status, i) => (
        <React.Fragment key={i}>
          <Stone size={30} status={status === "done" ? "done" : status} label={i + 1} colors={[colorAt(i), colorAt(i + 1)]} />
          <View style={[styles.link, { backgroundColor: status === "done" ? colorAt(i + 1) : tokens.divider }]} />
        </React.Fragment>
      ))}
      <View style={[styles.den, denReached ? styles.denReached : styles.denAhead]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  link: {
    width: 14,
    height: 4,
    borderRadius: 2,
  },

  den: {
    width: 34,
    height: 32,
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },

  denReached: {
    backgroundColor: tokens.plum,
  },

  denAhead: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D9D2DE",
  },
});
