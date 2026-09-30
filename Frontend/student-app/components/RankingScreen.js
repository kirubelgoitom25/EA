import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";

// Android's old architecture needs LayoutAnimation switched on. It is a no-op
// (and unnecessary) under the New Architecture, so skip it there.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental &&
  !global.nativeFabricUIManager
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PERIODS = ["Weekly", "Monthly", "Overall"];

const HEADER_HEIGHT = 92; // 44 top inset + 36 button + 12 bottom
const ROWS_START = 400; // ms before the first learner row enters
const ROW_STAGGER = 45; // ms between rows
const STAGGER_LIMIT = 12; // rows beyond this simply render, no entrance

const EASE_OUT = Easing.out(Easing.cubic);
const EASE_POP = Easing.out(Easing.back(1.6));

const PODIUM_DELAY = { 2: 300, 3: 360, 1: 440 };

const getXpForPeriod = (item, period) => {
  if (period === "Weekly" && typeof item.weeklyXp === "number") return item.weeklyXp;
  if (period === "Monthly" && typeof item.monthlyXp === "number") return item.monthlyXp;
  return item.xp ?? 0;
};

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

/* ------------------------------------------------------------------ */
/* Small animation building blocks (core Animated only, native driver) */
/* ------------------------------------------------------------------ */

// Fades + lifts + scales a block in once, on mount.
function Entrance({
  delay = 0,
  duration = 380,
  fromY = 12,
  fromScale = 0.98,
  easing = EASE_OUT,
  enabled = true,
  style,
  children,
  ...rest
}) {
  const progress = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) return undefined;

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing,
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [progress, enabled, duration, delay, easing]);

  const animatedStyle = useMemo(
    () => ({
      opacity: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: "clamp",
      }),
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [fromY, 0],
          }),
        },
        {
          scale: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [fromScale, 1],
          }),
        },
      ],
    }),
    [progress, fromY, fromScale]
  );

  return (
    <Animated.View {...rest} style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

// Tactile press feedback: 1 -> 0.96 -> 1.
function PressableScale({
  onPress,
  style,
  pressableStyle,
  scaleTo = 0.96,
  children,
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (toValue) => {
      Animated.spring(scale, {
        toValue,
        speed: 50,
        bounciness: 6,
        useNativeDriver: true,
      }).start();
    },
    [scale]
  );

  return (
    <Pressable
      {...rest}
      style={pressableStyle}
      onPress={onPress}
      onPressIn={() => animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// Counts up to `value` on first show, then eases from the old number to the
// new one whenever it changes (e.g. switching Weekly -> Monthly). This one
// runs on the JS thread, so it is only used for the handful of headline XP
// numbers, never for every row.
function CountUp({ value, delay = 0, duration = 800, suffix = "", style }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const anim = useRef(new Animated.Value(0)).current;
  const shown = useRef(0);
  const hasRun = useRef(false);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: current }) => {
      const next = Math.round(current);
      if (next !== shown.current) {
        shown.current = next;
        setDisplay(next);
      }
    });

    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: target,
      duration: hasRun.current ? 450 : duration,
      delay: hasRun.current ? 0 : delay,
      easing: EASE_OUT,
      useNativeDriver: false,
    });

    hasRun.current = true;
    animation.start();

    return () => animation.stop();
  }, [anim, target, delay, duration]);

  return (
    <Text style={style} accessibilityLabel={`${target}${suffix}`}>
      {`${display}${suffix}`}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Podium + rows                                                        */
/* ------------------------------------------------------------------ */

function PodiumSlot({ entry, rank, styles }) {
  const isFirst = rank === 1;
  const delay = PODIUM_DELAY[rank];
  const float = useRef(new Animated.Value(0)).current;

  // 1st place drifts gently, three short cycles after it lands, then rests.
  useEffect(() => {
    if (!isFirst) return undefined;

    const cycle = Animated.sequence([
      Animated.timing(float, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(float, {
        toValue: 0,
        duration: 1400,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]);

    const animation = Animated.sequence([
      Animated.delay(1200),
      Animated.loop(cycle, { iterations: 3 }),
    ]);
    animation.start();

    return () => animation.stop();
  }, [isFirst, float]);

  const floatStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: float.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -4],
          }),
        },
      ],
    }),
    [float]
  );

  const pedestalStyle = isFirst
    ? styles.pedestalFirst
    : rank === 2
    ? styles.pedestalSecond
    : styles.pedestalThird;

  return (
    <Entrance
      delay={delay}
      duration={isFirst ? 560 : 420}
      fromY={isFirst ? 26 : 16}
      fromScale={isFirst ? 0.85 : 0.94}
      easing={isFirst ? EASE_POP : EASE_OUT}
      style={styles.podiumSlot}
    >
      <Animated.View
        style={[styles.avatarWrap, isFirst && styles.avatarWrapFirst, floatStyle]}
      >
        {isFirst && <View style={styles.halo} />}
        <View
          style={[
            styles.podiumAvatar,
            isFirst && styles.podiumAvatarFirst,
            entry.isCurrentUser && styles.podiumAvatarSelf,
          ]}
        >
          <Text style={styles.podiumAvatarText}>{getInitials(entry.name)}</Text>
        </View>
      </Animated.View>

      <Text style={styles.podiumName} numberOfLines={1}>
        {entry.isCurrentUser ? "You" : entry.name}
      </Text>

      <CountUp
        value={entry.periodXp}
        delay={delay + 250}
        suffix=" XP"
        style={[styles.podiumXp, isFirst && styles.podiumXpFirst]}
      />

      <View style={[styles.pedestal, pedestalStyle]}>
        <Text style={[styles.pedestalText, isFirst && styles.pedestalTextFirst]}>
          {rank}
        </Text>
      </View>
    </Entrance>
  );
}

function LearnerRow({ item, index, styles }) {
  // Entrance is decided once, when the row first mounts. Re-sorting after a
  // period change moves the row (via LayoutAnimation) without replaying it.
  const mountIndex = useRef(index).current;
  const animate = mountIndex < STAGGER_LIMIT;
  const delay = ROWS_START + mountIndex * ROW_STAGGER;
  const pulse = useRef(new Animated.Value(1)).current;
  const rank = index + 1;

  // The current user's avatar gets a single soft pop after the row lands.
  useEffect(() => {
    if (!item.isCurrentUser) return undefined;

    const animation = Animated.sequence([
      Animated.delay(animate ? delay + 320 : 500),
      Animated.spring(pulse, {
        toValue: 1.18,
        speed: 24,
        bounciness: 8,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, {
        toValue: 1,
        speed: 16,
        bounciness: 6,
        useNativeDriver: true,
      }),
    ]);
    animation.start();

    return () => animation.stop();
  }, [item.isCurrentUser, animate, delay, pulse]);

  const badgeStyle =
    rank === 1
      ? styles.rankBadgeGold
      : rank === 2
      ? styles.rankBadgeSilver
      : rank === 3
      ? styles.rankBadgeBronze
      : null;

  return (
    <Entrance
      enabled={animate}
      delay={delay}
      duration={320}
      fromY={10}
      style={[styles.userRow, item.isCurrentUser && styles.currentUserRow]}
    >
      <View style={[styles.rankBadge, badgeStyle]}>
        <Text style={[styles.rankNum, rank <= 3 && styles.rankNumTop]}>{rank}</Text>
      </View>

      <Animated.View
        style={[
          styles.avatar,
          item.isCurrentUser && styles.avatarSelf,
          { transform: [{ scale: pulse }] },
        ]}
      >
        <Text style={[styles.avatarText, item.isCurrentUser && styles.avatarTextSelf]}>
          {getInitials(item.name)}
        </Text>
      </Animated.View>

      <View style={styles.userInfo}>
        <Text
          style={[styles.userName, item.isCurrentUser && styles.currentUserName]}
          numberOfLines={1}
        >
          {item.isCurrentUser ? "You" : item.name}
        </Text>
        <Text style={[styles.userMeta, item.isCurrentUser && styles.userMetaSelf]}>
          {item.periodXp} XP
        </Text>
      </View>
    </Entrance>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export default function RankingScreen({
  student,
  ranking,
  onBack,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [period, setPeriod] = useState("Weekly");
  const [tabWidth, setTabWidth] = useState(0);

  const tabAnim = useRef(new Animated.Value(0)).current; // 0..2 = active tab
  const swap = useRef(new Animated.Value(1)).current; // list/podium fade on switch
  const scrollY = useRef(new Animated.Value(0)).current;

  const leaderboard = useMemo(() => {
    const others = ranking
      .filter((item) => item.id !== student.id)
      .map((item) => ({ ...item, isCurrentUser: false }));

    const currentStudent = {
      id: student.id,
      name: student.name,
      xp: student.xp,
      weeklyXp: student.weeklyXp,
      monthlyXp: student.monthlyXp,
      isCurrentUser: true,
    };

    return [...others, currentStudent]
      .map((item) => ({ ...item, periodXp: getXpForPeriod(item, period) }))
      .sort((a, b) => b.periodXp - a.periodXp);
  }, [student, ranking, period]);

  const currentPosition = leaderboard.findIndex((item) => item.isCurrentUser) + 1;
  const currentXp = leaderboard.find((item) => item.isCurrentUser)?.periodXp ?? 0;
  const topThree = leaderboard.slice(0, 3);

  const handlePeriodChange = useCallback(
    (next) => {
      if (next === period) return;

      // Rows keep their keys, so LayoutAnimation slides them to new spots.
      LayoutAnimation.configureNext({
        duration: 320,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });

      swap.setValue(0.55);
      Animated.timing(swap, {
        toValue: 1,
        duration: 320,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();

      Animated.timing(tabAnim, {
        toValue: PERIODS.indexOf(next),
        duration: 260,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();

      setPeriod(next);
    },
    [period, swap, tabAnim]
  );

  const handleTabsLayout = useCallback((event) => {
    // container width - 2px border - 8px padding, split across the tabs
    const inner = event.nativeEvent.layout.width - 2 - 8;
    setTabWidth(inner / PERIODS.length);
  }, []);

  const pillTranslateX = useMemo(
    () =>
      tabAnim.interpolate({
        inputRange: PERIODS.map((_, i) => i),
        outputRange: PERIODS.map((_, i) => i * tabWidth),
      }),
    [tabAnim, tabWidth]
  );

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY]
  );

  const headerBgOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 24],
        outputRange: [0, 1],
        extrapolate: "clamp",
      }),
    [scrollY]
  );

  const titleScale = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 80],
        outputRange: [1, 0.86],
        extrapolate: "clamp",
      }),
    [scrollY]
  );

  const pillReady = tabWidth > 0;
  const podiumOrder = [
    { entry: topThree[1], rank: 2 },
    { entry: topThree[0], rank: 1 },
    { entry: topThree[2], rank: 3 },
  ];

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <Entrance delay={70} style={styles.tabsContainer} onLayout={handleTabsLayout}>
          {pillReady && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabPill,
                { width: tabWidth, transform: [{ translateX: pillTranslateX }] },
              ]}
            />
          )}

          {PERIODS.map((item) => {
            const isActive = period === item;
            return (
              <PressableScale
                key={item}
                pressableStyle={styles.tabPressable}
                style={styles.tab}
                scaleTo={0.95}
                onPress={() => handlePeriodChange(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.tabText,
                    isActive && pillReady && styles.activeTabText,
                  ]}
                >
                  {item}
                </Text>
              </PressableScale>
            );
          })}
        </Entrance>

        <Entrance delay={140} style={styles.userCard}>
          <View style={styles.userCardLeft}>
            <Entrance
              delay={320}
              duration={480}
              fromY={0}
              fromScale={0.5}
              easing={EASE_POP}
              style={styles.userBadge}
            >
              <Ionicons name="flash" size={20} color="#fff" />
            </Entrance>
            <View>
              <Text style={styles.userCardLabel}>Your position</Text>
              <Text style={styles.userCardValue}>#{currentPosition}</Text>
            </View>
          </View>

          <View style={styles.userCardStat}>
            <CountUp
              value={currentXp}
              delay={300}
              style={styles.userCardStatValue}
            />
            <Text style={styles.userCardStatLabel}>XP</Text>
          </View>
        </Entrance>

        {topThree.length >= 3 && (
          <Entrance delay={220} style={styles.podiumCard}>
            <Animated.View style={[styles.podiumRow, { opacity: swap }]}>
              {podiumOrder.map(({ entry, rank }) => (
                <PodiumSlot
                  key={`podium-${rank}`}
                  entry={entry}
                  rank={rank}
                  styles={styles}
                />
              ))}
            </Animated.View>
          </Entrance>
        )}

        <Entrance delay={320} style={styles.listShadow}>
          <Animated.View style={[styles.listInner, { opacity: swap }]}>
            <Text style={styles.listHeader}>ALL LEARNERS</Text>
            {leaderboard.map((item, index) => (
              <LearnerRow key={item.id} item={item} index={index} styles={styles} />
            ))}
          </Animated.View>
        </Entrance>
      </Animated.ScrollView>

      {/* Sticky header: fades in a background and shrinks the title on scroll */}
      <View style={styles.headerWrap} pointerEvents="box-none">
        <Animated.View
          pointerEvents="none"
          style={[styles.headerBg, { opacity: headerBgOpacity }]}
        />
        <Entrance delay={0} fromY={-8} fromScale={1}>
          <View style={styles.header}>
            <PressableScale
              onPress={onBack}
              style={styles.backBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </PressableScale>

            <Animated.Text
              style={[styles.headerTitle, { transform: [{ scale: titleScale }] }]}
            >
              RANKING
            </Animated.Text>

            <View style={styles.headerSpacer} />
          </View>
        </Entrance>
      </View>

      <BottomNavBar
        active="ranking"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "profile") onProfile();
        }}
      />
    </View>
  );
}

const createStyles = (colors) => {
  // Soft, theme-tinted elevation used across cards for depth.
  const lift = (level = 1) => ({
    shadowColor: colors.shadow,
    shadowOpacity: 0.55,
    shadowRadius: 8 * level,
    shadowOffset: { width: 0, height: 4 * level },
    elevation: 2 * level,
  });

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.screenBg },
    container: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: HEADER_HEIGHT + 4,
      paddingBottom: 120,
    },

    // Header
    headerWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      paddingTop: 44,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    headerBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.screenBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      ...lift(0.5),
    },
    headerTitle: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
    headerSpacer: { width: 36 },

    // Tabs
    tabsContainer: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
      ...lift(0.75),
    },
    tabPill: {
      position: "absolute",
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: radius.md,
      backgroundColor: colors.orange,
      shadowColor: colors.orangeDeep,
      shadowOpacity: 0.3,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    tabPressable: { flex: 1 },
    tab: { paddingVertical: 12, alignItems: "center", borderRadius: radius.md },
    tabText: { fontWeight: "800", color: colors.textMuted, fontSize: 13 },
    activeTabText: { color: "#fff" },

    // Your position
    userCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: colors.orangeSoft,
      marginBottom: 18,
      ...lift(1.25),
    },
    userCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    userBadge: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.orange,
      alignItems: "center",
      justifyContent: "center",
    },
    userCardLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
    userCardValue: { fontSize: 24, fontWeight: "900", color: colors.text },
    userCardStat: { alignItems: "flex-end" },
    userCardStatValue: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.orangeDeep,
      fontVariant: ["tabular-nums"],
    },
    userCardStatLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },

    // Podium
    podiumCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 18,
      ...lift(1.25),
    },
    podiumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    podiumSlot: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
    avatarWrap: { alignItems: "center", justifyContent: "center", marginBottom: 8 },
    avatarWrapFirst: { width: 56, height: 56, marginTop: 8 },
    halo: {
      position: "absolute",
      top: -11,
      left: -11,
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: colors.yellow,
      opacity: 0.28,
    },
    podiumAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.orangeLight,
      alignItems: "center",
      justifyContent: "center",
    },
    podiumAvatarFirst: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.yellow,
      ...lift(0.75),
    },
    podiumAvatarSelf: { borderWidth: 3, borderColor: colors.orangeDeep },
    podiumAvatarText: { fontWeight: "800", color: colors.text },
    podiumName: { fontSize: 11, fontWeight: "700", color: colors.text },
    podiumXp: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textSecondary,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
    },
    podiumXpFirst: { fontSize: 12, fontWeight: "800", color: colors.orangeDeep },
    pedestal: {
      width: "78%",
      marginTop: 10,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    pedestalFirst: { height: 46, backgroundColor: colors.orange },
    pedestalSecond: { height: 34, backgroundColor: colors.orangeSoft },
    pedestalThird: { height: 26, backgroundColor: colors.orangeLight },
    pedestalText: { fontSize: 14, fontWeight: "900", color: colors.orangeDeep },
    pedestalTextFirst: { color: "#fff", fontSize: 16 },

    // Learner list
    listShadow: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      ...lift(1.25),
    },
    listInner: {
      borderRadius: radius.xl,
      overflow: "hidden",
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    listHeader: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.textMuted,
      letterSpacing: 1,
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 8,
    },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    currentUserRow: {
      backgroundColor: colors.orangeLight,
      borderLeftWidth: 4,
      borderLeftColor: colors.orange,
      paddingLeft: 12,
    },
    rankBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    rankBadgeGold: { backgroundColor: colors.yellow },
    rankBadgeSilver: { backgroundColor: colors.orangeSoft },
    rankBadgeBronze: { backgroundColor: colors.orangeLight },
    rankNum: { fontWeight: "800", color: colors.textMuted, fontSize: 13 },
    rankNumTop: { color: colors.text },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.bgSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    avatarSelf: { backgroundColor: colors.orange },
    avatarText: { fontSize: 12, fontWeight: "800", color: colors.text },
    avatarTextSelf: { color: "#fff" },
    userInfo: { flex: 1 },
    userName: { fontSize: 15, fontWeight: "800", color: colors.text },
    currentUserName: { color: colors.orangeDeep },
    userMeta: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginTop: 2 },
    userMetaSelf: { color: colors.orangeDeep },
  });
};