import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";

import { layout, space, TAIL, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import { displayName, rankEntries } from "./rankingModel";
import AppText from "./ui/AppText";
import EmptyState from "./ui/EmptyState";
import Header from "./ui/Header";
import Screen from "./ui/Screen";

const SCOPES = [
  { key: "class", label: "Class" },
  { key: "national", label: "National" },
];
const PERIODS = [
  { key: "weekly", label: "This week" },
  { key: "monthly", label: "This month" },
  { key: "overall", label: "All time" },
];
const TOP = 50;
const SUMMIT = 196;

// The leaderboard: your spot, the top three on the summit, then everyone
// else. Class shows full names; National shows "First L.".
export default function RankingScreen({
  student = {},
  ranking = [],
  rankingScope = "class",
  onRankingScopeChange = () => {},
  rankingPeriod = "weekly",
  onRankingPeriodChange = () => {},
  onRefresh,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const { width } = useWindowDimensions();
  const summitWidth = width - layout.gutter * 2;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const entries = useMemo(
    () => rankEntries(ranking, rankingPeriod, student.id),
    [ranking, rankingPeriod, student.id],
  );
  const you = entries.find((entry) => entry.isYou);
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, TOP);
  const youBelow = you && you.position > TOP;
  const periodLabel = PERIODS.find((p) => p.key === rankingPeriod)?.label ?? "";
  const name = (entry) => (entry.isYou ? "You" : displayName(entry.name, rankingScope));

  return (
    <View style={styles.root}>
      <Screen
        withTabBar
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tokens.accent} colors={[tokens.accent]} /> : undefined}
      >
        <Header title="Leaderboard" />

        <View style={styles.segment} accessibilityRole="tablist">
          {SCOPES.map((scope) => {
            const selected = scope.key === rankingScope;
            return (
              <Pressable
                key={scope.key}
                onPress={() => !selected && onRankingScopeChange(scope.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.segmentItem, selected && styles.segmentSelected]}
              >
                <AppText variant="label" tone={selected ? "primary" : "secondary"}>
                  {scope.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.periods}>
          {PERIODS.map((period) => {
            const selected = period.key === rankingPeriod;
            return (
              <Pressable
                key={period.key}
                onPress={() => !selected && onRankingPeriodChange(period.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.period, selected && styles.periodSelected]}
              >
                <AppText variant="label" tone={selected ? "accent" : "secondary"}>
                  {period.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {entries.length === 0 ? (
          <EmptyState title="No rankings yet" message="Earn XP in any chapter to join the leaderboard." />
        ) : (
          <>
            <View style={styles.yourSpot} accessible accessibilityLabel={you ? `You're number ${you.position}, ${you.periodXp} XP` : "Not ranked yet"}>
              {you ? (
                <>
                  <AppText variant="display">You're #{you.position}</AppText>
                  <AppText tone="secondary" style={styles.yourCaption}>
                    {you.periodXp} XP · {periodLabel.toLowerCase()} · {rankingScope === "national" ? "nationally" : "in your class"}
                  </AppText>
                </>
              ) : (
                <AppText tone="secondary">Earn XP to join the leaderboard.</AppText>
              )}
            </View>

            <Summit width={summitWidth} top3={top3} name={name} />

            {rest.length > 0 ? (
              <View style={styles.list}>
                {rest.map((entry, index) => (
                  <Row key={entry.id || index} entry={entry} name={name(entry)} divider={index < rest.length - 1 && !entry.isYou} />
                ))}
                {youBelow ? (
                  <>
                    <AppText tone="tertiary" style={styles.gap}>···</AppText>
                    <Row entry={you} name="You" />
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </Screen>

      <BottomNavBar
        active="ranking"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile();
        }}
      />
    </View>
  );
}

// The top three as stones on a small hill: first at the peak, second and
// third on the slopes.
function Summit({ width, top3, name }) {
  const spots = [
    { x: width * 0.5, y: 14 }, // 1st
    { x: width * 0.18, y: 70 }, // 2nd
    { x: width * 0.82, y: 92 }, // 3rd
  ];
  const hill = `M0 ${SUMMIT} C${width * 0.18} ${SUMMIT * 0.62} ${width * 0.34} ${SUMMIT * 0.34} ${width * 0.5} ${SUMMIT * 0.34} C${width * 0.66} ${SUMMIT * 0.34} ${width * 0.82} ${SUMMIT * 0.62} ${width} ${SUMMIT} Z`;

  return (
    <View style={{ width, height: SUMMIT, marginTop: space.xl }}>
      <Svg width={width} height={SUMMIT} style={StyleSheet.absoluteFill}>
        <Path d={hill} fill={tokens.neutralTint} />
      </Svg>
      {top3.map((entry, i) => (
        <View
          key={entry.id || i}
          style={[styles.spot, { left: spots[i].x - 55, top: spots[i].y }]}
          accessible
          accessibilityLabel={`Number ${i + 1}, ${name(entry)}, ${entry.periodXp} XP`}
        >
          <RankStone place={i + 1} you={entry.isYou} />
          <AppText variant="label" numberOfLines={1} style={styles.spotName}>
            {name(entry)}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {entry.periodXp} XP
          </AppText>
        </View>
      ))}
    </View>
  );
}

// First place wears the Tail; second is ember-tinted; third is quiet.
function RankStone({ place, you }) {
  const size = place === 1 ? 64 : 54;
  const box = {
    width: size,
    height: size,
    borderRadius: size / 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: you ? 3 : 0,
    borderColor: tokens.accent,
  };
  if (place === 1) {
    return (
      <LinearGradient colors={TAIL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>
        <AppText variant="title" tone="onAccent">1</AppText>
      </LinearGradient>
    );
  }
  return (
    <View style={[box, { backgroundColor: place === 2 ? tokens.accentTint : tokens.surface }]}>
      <AppText variant="title" tone={place === 2 ? "accent" : "secondary"}>
        {place}
      </AppText>
    </View>
  );
}

function Row({ entry, name, divider = false }) {
  return (
    <View style={[styles.row, entry.isYou && styles.rowYou, divider && styles.divider]}>
      <AppText variant="label" tone={entry.isYou ? "accent" : "secondary"} style={styles.position}>
        {entry.position}
      </AppText>
      <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="label" tone="secondary">
        {entry.periodXp} XP
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  flex: {
    flex: 1,
  },

  segment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 24,
    backgroundColor: tokens.neutralTint,
  },

  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  segmentSelected: {
    backgroundColor: tokens.surface,
  },

  periods: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
  },

  period: {
    height: 36,
    paddingHorizontal: space.md + 2,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  periodSelected: {
    backgroundColor: tokens.accentTint,
  },

  yourSpot: {
    marginTop: space.xxl,
  },

  yourCaption: {
    marginTop: space.xs,
  },

  spot: {
    position: "absolute",
    width: 110,
    alignItems: "center",
  },

  spotName: {
    marginTop: space.sm,
    maxWidth: 110,
  },

  list: {
    marginTop: space.lg,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.md,
  },

  rowYou: {
    backgroundColor: tokens.accentTint,
    borderRadius: 16,
  },

  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },

  position: {
    width: 28,
  },

  gap: {
    textAlign: "center",
    paddingVertical: space.xs,
  },
});
