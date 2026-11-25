import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Path, SvgXml } from "react-native-svg";

import { fonts, ui } from "../theme";
import BottomNavBar from "./BottomNavBar";
import { displayName, rankEntries } from "./rankingModel";
import { ProBadge } from "./ProScreen";
import Rise from "./session/Rise";
import AppText from "./ui/AppText";
import EmptyState from "./ui/EmptyState";
import { CURVE, MOTION, popTiming, reduceMotionNow, useReducedMotion } from "./ui/motion";
import { EdgeBox } from "./ui/PressLip";
import { PODIUM_ART } from "./ui/sceneryArt";
import { QUIET_REFRESH } from "./ui/Skeleton";
import Screen from "./ui/Screen";
import { firstVisit, TabScene } from "./ui/tabMotion";

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

const SIDE = 16; // screen margins
const INSET = 20; // text blocks
const PANEL_H = 236;
const TRACK_PAD = 5;
const SEG_GAP = 4;
const SEG_H = 42; // with its 3 dp edge
const SEG_EDGE = 3;
const PILL_H = 38; // with its 3 dp edge

// Podium blocks (handoff part 2): size, face, the lighter band showing 5 dp above the face, number.
const BLOCKS = {
  1: { w: 108, h: 122, face: ui.primary, top: "#5F9E7F", ink: "#FFFFFF", size: 40 },
  2: { w: 100, h: 84, face: ui.bannerFill, top: ui.done.top, ink: ui.done.ink, size: 32 },
  3: { w: 100, h: 62, face: ui.surface, top: ui.pill.bg, ink: ui.done.ink, size: 28 },
};
const BLOCK_GAP = 8;
const RISE_MS = 600;
const RISE_DELAY = { 1: 300, 2: 100, 3: 0 }; // 3rd first, then 2nd, then 1st
const LANDED = (place) => RISE_DELAY[place] + RISE_MS;
const CROWN_AT = LANDED(1) + 150;
const ROWS_AT = LANDED(1); // the list starts once the podium has landed
const ROW_STEP = 70;
const ROWS_STAGGERED = 10; // rows further down (off screen) come in with the tenth
const DATA_WAIT = 1500; // after a switch, how long the board waits for the new ranking before showing what it has

// The leaderboard: your spot, the top three on the podium, then everyone else. Class shows full
// names; National shows "First L.". Changing class/national or the period cross-fades the board
// (150 ms out, then its entrance plays again with the new ranking).
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
  const panelWidth = width - SIDE * 2;
  const [refreshing, setRefreshing] = useState(false);
  const [firstTime] = useState(() => firstVisit("ranking"));

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const board = useBoardSwap({ ranking, scope: rankingScope, period: rankingPeriod, firstTime });

  return (
    <View style={styles.root}>
      <TabScene tab="ranking">
        <Screen
          withTabBar
          background={ui.screen}
          contentStyle={styles.content}
          pulsing={refreshing}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} {...QUIET_REFRESH} /> : undefined}
        >
          <AppText style={styles.title} accessibilityRole="header">
            Leaderboard
          </AppText>

          <ScopeSwitch width={panelWidth} value={rankingScope} onChange={onRankingScopeChange} />

          <View style={styles.periods}>
            {PERIODS.map((period) => (
              <PeriodPill
                key={period.key}
                label={period.label}
                selected={period.key === rankingPeriod}
                onPress={() => period.key !== rankingPeriod && onRankingPeriodChange(period.key)}
              />
            ))}
          </View>

          <Animated.View style={{ opacity: board.opacity }}>
            <Board
              key={board.shown.gen}
              ranking={board.shown.ranking}
              scope={board.shown.scope}
              period={board.shown.period}
              studentId={student.id}
              panelWidth={panelWidth}
              play={board.shown.play}
            />
          </Animated.View>
        </Screen>
      </TabScene>

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

// What the board shows. The switch and the filters answer at once; the board fades out (150 ms),
// waits for the new ranking when one was asked for (the class board already has every period),
// then comes back with its entrance. A refresh with the same scope and period updates it in place.
function useBoardSwap({ ranking, scope, period, firstTime }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState({ ranking, scope, period, gen: 0, play: firstTime });
  const latest = useRef({ ranking, scope, period });
  latest.current = { ranking, scope, period };
  const pending = useRef(null);

  const finish = useCallback(() => {
    const p = pending.current;
    if (!p || !p.faded) return;
    const now = latest.current;
    if (p.needsData && now.ranking === p.base && !p.timedOut) return;
    clearTimeout(p.timer);
    pending.current = null;
    setShown((before) => ({ ranking: now.ranking, scope: now.scope, period: now.period, gen: before.gen + 1, play: true }));
    opacity.setValue(1);
  }, [opacity]);

  useEffect(() => {
    const key = `${scope}|${period}`;
    const p = pending.current;
    if (!p && key === `${shown.scope}|${shown.period}`) {
      if (ranking !== shown.ranking) setShown((before) => ({ ...before, ranking }));
      return;
    }
    if (!p || p.key !== key) {
      const needsData = !(scope === "class" && (p ? p.fromScope : shown.scope) === "class");
      const next = { key, base: ranking, needsData, fromScope: p ? p.fromScope : shown.scope, faded: p ? p.faded : false, timedOut: false, timer: p?.timer };
      pending.current = next;
      if (!p) {
        Animated.timing(opacity, { toValue: 0, duration: MOTION.fade, useNativeDriver: true }).start(() => {
          if (!pending.current) return;
          pending.current.faded = true;
          finish();
        });
      }
      clearTimeout(next.timer);
      next.timer = setTimeout(() => {
        if (!pending.current) return;
        pending.current.timedOut = true;
        finish();
      }, MOTION.fade + DATA_WAIT);
    }
    finish();
  }, [scope, period, ranking, shown, opacity, finish]);

  useEffect(() => () => clearTimeout(pending.current?.timer), []);

  return { shown, opacity };
}

function Board({ ranking, scope, period, studentId, panelWidth, play }) {
  const entries = useMemo(() => rankEntries(ranking, period, studentId), [ranking, period, studentId]);
  const you = entries.find((entry) => entry.isYou);
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, TOP);
  const youBelow = you && you.position > TOP;
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "";
  const name = (entry) => (entry.isYou ? "You" : displayName(entry.name, scope));

  if (entries.length === 0) {
    return <EmptyState title="No rankings yet" message="Earn XP in any chapter to join the leaderboard." />;
  }

  return (
    <>
      <View style={styles.yourSpot} accessible accessibilityLabel={you ? `You're number ${you.position}, ${you.periodXp} XP` : "Not ranked yet"}>
        {you ? (
          <>
            <AppText style={styles.yourRank}>You're #{you.position}</AppText>
            <AppText style={styles.yourCaption}>
              {you.periodXp} XP · {periodLabel.toLowerCase()} · {scope === "national" ? "nationally" : "in your class"}
            </AppText>
          </>
        ) : (
          <AppText style={styles.yourCaption}>Earn XP to join the leaderboard.</AppText>
        )}
      </View>

      <Podium width={panelWidth} top3={top3} name={name} play={play} />

      {rest.length > 0 ? (
        <View style={styles.list}>
          {rest.map((entry, index) => (
            <Rise key={entry.id || index} order={Math.min(index, ROWS_STAGGERED)} distance={22} step={ROW_STEP} delay={ROWS_AT} play={play}>
              <Row entry={entry} name={name(entry)} />
            </Rise>
          ))}
          {youBelow ? (
            <Rise order={Math.min(rest.length, ROWS_STAGGERED)} distance={22} step={ROW_STEP} delay={ROWS_AT} play={play}>
              <AppText style={styles.gap}>···</AppText>
              <Row entry={you} name="You" />
            </Rise>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

// Class / National: a sunken track; the selected side is a white pill with a 3 dp edge that slides
// over (250 ms, overshoot). The tapped side dips to 0.96 while held.
function ScopeSwitch({ width, value, onChange }) {
  const segW = (width - TRACK_PAD * 2 - SEG_GAP) / 2;
  const index = Math.max(SCOPES.findIndex((scope) => scope.key === value), 0);
  const slide = useRef(new Animated.Value(index)).current;
  const scales = useRef(SCOPES.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (reduceMotionNow()) {
      slide.setValue(index);
      return undefined;
    }
    const run = Animated.timing(slide, { toValue: index, duration: 250, easing: CURVE.pop, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [index, slide]);

  const pillMotion = useMemo(
    () => ({ transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, segW + SEG_GAP] }) }] }),
    [slide, segW],
  );

  const dip = (i, down) => {
    const toValue = down ? 0.96 : 1;
    if (reduceMotionNow()) return scales[i].setValue(1);
    if (down) Animated.timing(scales[i], { toValue, duration: MOTION.press, useNativeDriver: true }).start();
    else Animated.spring(scales[i], { toValue, friction: 5, tension: 220, useNativeDriver: true }).start();
  };

  return (
    <View style={styles.track} accessibilityRole="tablist">
      <View pointerEvents="none" style={styles.trackInset} />
      <Animated.View pointerEvents="none" style={[styles.switchPill, { width: segW }, pillMotion]}>
        <Animated.View style={{ transform: [{ scale: scales[index] }] }}>
          <EdgeBox lip={ui.surfaceEdge} lipSize={SEG_EDGE} radius={12} faceStyle={styles.switchPillFace} />
        </Animated.View>
      </Animated.View>
      {SCOPES.map((scope, i) => {
        const selected = i === index;
        return (
          <Pressable
            key={scope.key}
            onPress={() => !selected && onChange(scope.key)}
            onPressIn={() => dip(i, true)}
            onPressOut={() => dip(i, false)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, { width: segW }]}
          >
            <Animated.View style={[styles.segmentFace, { transform: [{ scale: scales[i] }] }]}>
              <AppText style={[styles.segmentLabel, selected && styles.segmentLabelOn]}>{scope.label}</AppText>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

// A period filter: the selected one is a pale green pill with a 3 dp edge; the others are bare text.
// Pressed: 0.94.
function PeriodPill({ label, selected, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (down) => {
    if (reduceMotionNow()) return;
    if (down) Animated.timing(scale, { toValue: 0.94, duration: MOTION.press, useNativeDriver: true }).start();
    else Animated.spring(scale, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }).start();
  };
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <EdgeBox
          lip={selected ? ui.pill.edge : "transparent"}
          lipSize={SEG_EDGE}
          radius={12}
          faceStyle={[styles.periodFace, selected && styles.periodFaceOn]}
        >
          <AppText style={[styles.periodLabel, selected && styles.periodLabelOn]}>{label}</AppText>
        </EdgeBox>
      </Animated.View>
    </Pressable>
  );
}

// The top three on blocks standing on the panel's bottom edge, 2nd · 1st · 3rd. The blocks rise from
// below the edge (3rd, then 2nd, then 1st); each name pops in once its block lands, the crown last.
function Podium({ width, top3, name, play }) {
  const fit = Math.min(1, (width - 16) / (BLOCKS[1].w + BLOCKS[2].w + BLOCKS[3].w + BLOCK_GAP * 2));
  const order = [2, 1, 3].filter((place) => top3[place - 1]);
  return (
    <View style={[styles.panel, { width }]}>
      <SvgXml xml={PODIUM_ART.xml} width={width} height={PANEL_H} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill} />
      <View style={styles.blocks}>
        {order.map((place) => (
          <PodiumSpot key={place} place={place} entry={top3[place - 1]} label={name(top3[place - 1])} width={Math.round(BLOCKS[place].w * fit)} play={play} />
        ))}
      </View>
    </View>
  );
}

function PodiumSpot({ place, entry, label, width, play }) {
  const reduce = useReducedMotion();
  const still = reduce || !play;
  const block = BLOCKS[place];
  const rise = useRef(new Animated.Value(still ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  const crown = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) return undefined;
    const run = Animated.parallel([
      Animated.timing(rise, { toValue: 1, delay: RISE_DELAY[place], duration: RISE_MS, easing: CURVE.rise, useNativeDriver: true }),
      popTiming(pop, { delay: LANDED(place) }),
      popTiming(crown, { delay: CROWN_AT }),
    ]);
    run.start();
    return () => run.stop();
  }, [still, place, rise, pop, crown]);

  const motion = useMemo(() => {
    const popped = (v) => ({
      opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
    });
    return {
      block: { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [block.h + 8, 0] }) }] },
      label: popped(pop),
      crown: popped(crown),
    };
  }, [rise, pop, crown, block.h]);

  return (
    <View style={[styles.spot, { width }]} accessible accessibilityLabel={`Number ${place}, ${label}, ${entry.periodXp} XP`}>
      {place === 1 ? (
        <Animated.View style={[styles.crown, motion.crown]}>
          <Crown />
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.spotLabel, motion.label]}>
        <AppText numberOfLines={1} style={[styles.spotName, place === 1 && styles.spotNameFirst, { maxWidth: width }]}>
          {label}
        </AppText>
        <AppText numberOfLines={1} style={[styles.spotXp, place === 1 && styles.spotXpFirst]}>
          {entry.periodXp} XP
        </AppText>
      </Animated.View>
      <Animated.View style={[styles.block, { width, height: block.h, backgroundColor: block.top }, motion.block]}>
        <View style={[styles.blockFace, { backgroundColor: block.face }]}>
          <AppText style={[styles.blockNumber, { fontSize: block.size, lineHeight: Math.round(block.size * 1.15), color: block.ink }]}>{place}</AppText>
        </View>
      </Animated.View>
    </View>
  );
}

// First place's small amber crown.
function Crown() {
  return (
    <Svg width={30} height={24} viewBox="0 0 30 24">
      <Path d="M4 20 L3 7 L10 12 L15 3 L20 12 L27 7 L26 20 Z" fill="#F7A531" stroke="#C97A12" strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

// A flat row (it does nothing when tapped, so it has no edge and never moves).
function Row({ entry, name }) {
  return (
    <View style={[styles.row, entry.isYou && styles.rowYou]}>
      <View style={[styles.chip, entry.isYou && styles.chipYou]}>
        <AppText style={[styles.chipText, entry.isYou && styles.chipTextYou]}>{entry.position}</AppText>
      </View>
      <View style={styles.nameRow}>
        <AppText style={styles.rowName} numberOfLines={1}>
          {name}
        </AppText>
        {entry.pro ? <ProBadge small /> : null}
      </View>
      <AppText style={styles.rowXp}>{entry.periodXp} XP</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.screen, // what shows while one tab fades into another
  },

  content: {
    paddingHorizontal: SIDE,
    paddingTop: 0,
  },

  title: {
    marginTop: 22,
    marginHorizontal: INSET - SIDE,
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: ui.ink,
  },

  // Class / National
  track: {
    marginTop: 14,
    flexDirection: "row",
    gap: SEG_GAP,
    padding: TRACK_PAD,
    borderRadius: 16,
    backgroundColor: ui.slot,
    overflow: "hidden",
  },

  trackInset: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: ui.trackInset,
  },

  switchPill: {
    position: "absolute",
    left: TRACK_PAD,
    top: TRACK_PAD,
  },

  switchPillFace: {
    height: SEG_H - SEG_EDGE,
    backgroundColor: ui.surface,
  },

  segment: {
    height: SEG_H,
  },

  segmentFace: {
    height: SEG_H - SEG_EDGE,
    alignItems: "center",
    justifyContent: "center",
  },

  segmentLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: ui.textMuted,
  },

  segmentLabelOn: {
    fontFamily: fonts.display,
    color: ui.ink,
  },

  // periods
  periods: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },

  periodFace: {
    height: PILL_H - SEG_EDGE,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  periodFaceOn: {
    backgroundColor: ui.pill.bg,
  },

  periodLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 18,
    color: ui.textMuted,
  },

  periodLabelOn: {
    fontFamily: fonts.display,
    color: ui.done.ink,
  },

  // your rank
  yourSpot: {
    marginTop: 16,
    marginHorizontal: INSET - SIDE,
  },

  yourRank: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: ui.ink,
  },

  yourCaption: {
    marginTop: 2,
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: ui.textMuted,
  },

  // podium
  panel: {
    height: PANEL_H,
    marginTop: 16,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: ui.sky,
  },

  blocks: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: BLOCK_GAP,
  },

  spot: {
    alignItems: "center",
  },

  crown: {
    marginBottom: 4,
  },

  spotLabel: {
    alignItems: "center",
    marginBottom: 6,
  },

  spotName: {
    fontFamily: fonts.display,
    fontSize: 13,
    lineHeight: 18,
    color: ui.ink,
  },

  spotNameFirst: {
    fontSize: 14,
    lineHeight: 19,
  },

  spotXp: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: ui.textSecondary,
  },

  spotXpFirst: {
    fontFamily: fonts.display,
    color: ui.done.ink,
  },

  block: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },

  blockFace: {
    flex: 1,
    marginTop: 5,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    alignItems: "center",
    paddingTop: 6,
  },

  blockNumber: {
    fontFamily: fonts.display,
  },

  // the list
  list: {
    marginTop: 14,
    gap: 10,
  },

  row: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E3EAE5",
    backgroundColor: ui.surface,
  },

  rowYou: {
    backgroundColor: ui.pill.bg,
    borderColor: ui.primary,
  },

  chip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ui.locked.face,
  },

  chipYou: {
    backgroundColor: ui.primary,
  },

  chipText: {
    fontFamily: fonts.display,
    fontSize: 14,
    lineHeight: 18,
    color: ui.textMuted,
  },

  chipTextYou: {
    color: "#FFFFFF",
  },

  nameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  rowName: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: ui.ink,
  },

  rowXp: {
    fontFamily: fonts.display,
    fontSize: 13,
    lineHeight: 18,
    color: ui.textSecondary,
  },

  gap: {
    textAlign: "center",
    paddingBottom: 10,
    color: ui.textMuted,
  },
});
