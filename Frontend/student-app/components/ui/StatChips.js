import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { edge, fonts, space, ui } from "../../theme";
import AppText from "./AppText";
import { useCountUp, useFlicker } from "./anim";
import { useReducedMotion } from "./motion";
import PressLip, { EdgeBox } from "./PressLip";

// Your rank in the class ranking by total XP (the calculation Home has always used).
export function rankOf(ranking = [], user) {
  const others = ranking.filter((item) => item.id !== user.id);
  const combined = [...others, { id: user.id, xp: Number(user.xp) || 0 }].sort((a, b) => b.xp - a.xp);
  return combined.findIndex((item) => item.id === user.id) + 1;
}

// The three stat chips at the top right of the path screens: streak (flame), XP (bolt) and rank (cup),
// 8 dp apart. The numbers count up on arrival; the rank chip opens the leaderboard. When XP grows, its
// chip swells to 1.25 and back.
export default function StatChips({ user, ranking, onRanking, style }) {
  const streak = Math.max(Number(user?.streak) || 0, 0);
  const xp = Number(user?.xp) || 0;
  const rank = useMemo(() => (user ? rankOf(ranking, user) : 0), [ranking, user]);
  const streakShown = useCountUp(streak);
  const xpShown = useCountUp(xp);
  const rankShown = useCountUp(rank);
  const flame = useFlicker(streak);

  return (
    <View style={[styles.row, style]}>
      <Stat colors={ui.streak} accessibilityLabel={`${streak}-day streak`}>
        <Animated.View style={flame}>
          <Ionicons name="flame" size={18} color={ui.streak.icon} />
        </Animated.View>
        <AppText style={[styles.value, { color: ui.streak.ink }]}>{streakShown}</AppText>
      </Stat>
      <Stat colors={ui.xp} bump={xp} accessibilityLabel={`${xp} XP`}>
        <Ionicons name="flash" size={18} color={ui.xp.icon} />
        <AppText style={[styles.value, { color: ui.xp.ink }]}>{xpShown}</AppText>
      </Stat>
      <Stat colors={ui.trophy} onPress={onRanking} accessibilityLabel={`Rank ${rank} in your class. Open leaderboard`}>
        <Ionicons name="trophy" size={18} color={ui.trophy.icon} />
        <AppText style={[styles.value, { color: ui.trophy.ink }]}>{rankShown}</AppText>
      </Stat>
    </View>
  );
}

// One chip: icon and number on a tinted face with a 3 dp edge. With onPress it sinks when tapped.
// bump: when this value grows after the first show, the chip swells to 1.25 and back over 500 ms.
function Stat({ children, colors, onPress, bump, accessibilityLabel }) {
  const reduce = useReducedMotion();
  const swell = useRef(new Animated.Value(0)).current;
  const lastBump = useRef(bump);
  useEffect(() => {
    if (bump === lastBump.current) return undefined;
    const grew = bump > lastBump.current;
    lastBump.current = bump;
    if (!grew || reduce) return undefined;
    swell.setValue(0);
    const run = Animated.timing(swell, { toValue: 1, duration: 500, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [bump, reduce, swell]);
  const scale = swell.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [1, 1.25, 0.97, 1] });
  const face = [styles.stat, { backgroundColor: colors.bg }];
  const chip = onPress ? (
    <PressLip
      onPress={onPress}
      hitSlop={space.sm}
      accessibilityLabel={accessibilityLabel}
      lip={colors.edge}
      lipSize={edge.stat.depth}
      radius={edge.stat.radius}
      haptics
      faceStyle={face}
    >
      {children}
    </PressLip>
  ) : (
    <EdgeBox accessible accessibilityLabel={accessibilityLabel} lip={colors.edge} lipSize={edge.stat.depth} radius={edge.stat.radius} faceStyle={face}>
      {children}
    </EdgeBox>
  );
  return <Animated.View style={{ transform: [{ scale }] }}>{chip}</Animated.View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  stat: {
    height: 36,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  value: {
    fontFamily: fonts.display,
    fontSize: 14,
    lineHeight: 18,
  },
});
