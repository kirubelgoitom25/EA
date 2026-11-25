import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, ui } from "../../theme";
import AppText from "../ui/AppText";
import { popTiming, useReducedMotion } from "../ui/motion";
import { Dome } from "../ui/Rock";

const W = 38;
const H = 36;
const EDGE = 4;

// The stage stepper on results screens: one small tile per stage joined by short bars, the den at the
// end. Done: the completed-tile green with a check. Next: white with a green border and its number.
// Still ahead: the locked grey with its number. denReached lights the den. pop: the index of the stage
// just finished (its tile pops in).
export default function StageTrailMini({ statuses, denReached = false, pop = null }) {
  const n = statuses.length;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${statuses.filter((s) => s === "done").length} of ${n} stages done`}
    >
      {statuses.map((status, i) => (
        <React.Fragment key={i}>
          <StageTile status={status} number={i + 1} pop={pop === i} />
          <View style={[styles.bar, { backgroundColor: status === "done" ? ui.done.edge : ui.locked.edge }]} />
        </React.Fragment>
      ))}
      <View style={styles.den}>
        <Dome size={40} lit={denReached} />
      </View>
    </View>
  );
}

function StageTile({ status, number, pop }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(pop && !reduce ? 0 : 1)).current;
  useEffect(() => {
    if (!pop || reduce) return undefined;
    const run = popTiming(v, { delay: 300 });
    run.start();
    return () => run.stop();
  }, [pop, reduce, v]);

  const look =
    status === "done"
      ? { face: ui.done.face, edge: ui.done.edge, top: ui.done.top }
      : status === "next"
        ? { face: ui.surface, edge: ui.primary, border: ui.primary }
        : { face: ui.locked.face, edge: ui.locked.edge, top: ui.locked.top };

  return (
    <Animated.View style={[styles.tileBox, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
      <View style={[styles.lip, { backgroundColor: look.edge }]} />
      <View style={[styles.tile, { backgroundColor: look.face }, look.border && { borderWidth: 2, borderColor: look.border }]}>
        {look.top ? <View style={[styles.top, { backgroundColor: look.top }]} /> : null}
        {status === "done" ? (
          <Ionicons name="checkmark" size={20} color={ui.done.ink} />
        ) : (
          <AppText style={[styles.number, { color: status === "next" ? ui.primary : ui.locked.ink }]}>{number}</AppText>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: 8,
  },

  tileBox: {
    width: W,
    height: H + EDGE,
  },

  lip: {
    position: "absolute",
    left: 0,
    right: 0,
    top: EDGE,
    height: H,
    borderRadius: 12,
  },

  tile: {
    width: W,
    height: H,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },

  number: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 18,
  },

  bar: {
    width: 12,
    height: 6,
    borderRadius: 3,
  },

  den: {
    marginLeft: 2,
  },
});
