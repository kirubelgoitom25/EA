import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";
import XpProgressRing from "./XpProgressRing";
import DuoButton from "./DuoButton";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.76;
const CARD_STRIDE = CARD_WIDTH + 14;
const WEEK_DAYS = ["M", "T", "W", "T", "F", "S", "S"];

// Shared interaction language: cards 0.97, buttons 0.96
const PRESS_SCALE_CARD = 0.97;
const PRESS_SCALE_BUTTON = 0.96;
const SMALL_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const riseInStyle = (value, distance = 9) => ({
  opacity: value,
  transform: [
    {
      translateY: value.interpolate({
        inputRange: [0, 1],
        outputRange: [distance, 0],
      }),
    },
  ],
});

/**
 * Reusable press-feedback wrapper.
 *
 * - One native-driven value (`pressed`, 0 → 1) drives scale + a tiny opacity dip.
 * - Press in: fast timing (80ms). Release: soft spring back.
 * - `style`        -> the animated (visible) surface
 * - `wrapperStyle` -> the outer Pressable (use for flex / alignSelf / margins that
 *                     must live outside the animated surface)
 * - `children`     -> node, or a function `(pressed) => node` so children can react
 *                     to the same press value (highlight overlay, nudging chevron)
 * - No `onPress` = press feedback only (used by the stat cards).
 */
function ScalePressable({
  children,
  onPress,
  style,
  wrapperStyle,
  scaleTo = PRESS_SCALE_CARD,
  dimTo = 0.94,
  hitSlop,
  accessibilityLabel,
}) {
  const pressed = useRef(new Animated.Value(0)).current;

  useEffect(() => () => pressed.stopAnimation(), [pressed]);

  const handlePressIn = () => {
    pressed.stopAnimation();
    Animated.timing(pressed, {
      toValue: 1,
      duration: 80,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressed, {
      toValue: 0,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  const animatedStyle = {
    opacity: pressed.interpolate({
      inputRange: [0, 1],
      outputRange: [1, dimTo],
      extrapolate: "clamp",
    }),
    transform: [
      {
        scale: pressed.interpolate({
          inputRange: [0, 1],
          outputRange: [1, scaleTo],
        }),
      },
    ],
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={hitSlop}
      style={wrapperStyle}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[style, animatedStyle]}>
        {typeof children === "function" ? children(pressed) : children}
      </Animated.View>
    </Pressable>
  );
}

const getCourseVisual = (title = "", colors) => {
  const lower = title.toLowerCase();

  if (/python|code|javascript|programming|script/.test(lower)) {
    return { icon: "code-slash", color: colors.blue, bg: colors.blueLight };
  }

  if (/english|spanish|french|language/.test(lower)) {
    return { icon: "language", color: colors.purple, bg: "#F3EAFF" };
  }

  return { icon: "book", color: colors.orangeDeep, bg: colors.orangeLight };
};

const getNextLessonTitle = (course) => {
  for (const module of course.modules || []) {
    const next = module.lessons.find((lesson) => !lesson.completed);
    if (next) return next.title;
  }
  return null;
};

const useCountUp = (target, duration = 600) => {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const diff = target - from;

    if (diff === 0) return;

    const start = Date.now();
    let frame;

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      setValue(Math.round(from + diff * progress));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    tick();

    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
};

function StreakFlame({ size = 16 }) {
  const pulse = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(pulse, {
        toValue: 1.14,
        speed: 18,
        bounciness: 8,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, {
        toValue: 1,
        speed: 20,
        bounciness: 4,
        useNativeDriver: true,
      }),
    ]).start();

    return () => pulse.stopAnimation();
  }, [pulse]);

  return (
    <Animated.Text style={{ lineHeight: 18, fontSize: size, transform: [{ scale: pulse }] }}>
      🔥
    </Animated.Text>
  );
}

export default function HomeScreen({
  ranking,
  user,
  courses,
  onProfile,
  onCourses,
  onRanking,
  onSelectCourse,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const animatedXp = useCountUp(Number(user.xp) || 0);
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);
  const headerEntrance = useRef(new Animated.Value(0)).current;
  const heroEntrance = useRef(new Animated.Value(0)).current;
  const statsEntrance = useRef(new Animated.Value(0)).current;
  const learningEntrance = useRef(new Animated.Value(0)).current;
  const rankingEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(
      55,
      [headerEntrance, heroEntrance, statsEntrance, learningEntrance, rankingEntrance].map(
        (value) =>
          Animated.timing(value, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
      )
    ).start();
  }, [headerEntrance, heroEntrance, learningEntrance, rankingEntrance, statsEntrance]);

  const leaderboard = useMemo(() => {
    const others = ranking
      .filter((item) => item.id !== user.id)
      .map((item) => ({ ...item, isCurrentUser: false }));

    const combined = [
      ...others,
      { id: user.id, name: user.name, xp: user.xp, isCurrentUser: true },
    ];

    return combined
      .sort((a, b) => b.xp - a.xp)
      .map((item, index) => ({ ...item, position: index + 1 }));
  }, [user, ranking]);

  const currentUserEntry = leaderboard.find((item) => item.isCurrentUser);
  const podium = leaderboard.slice(0, 3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);

  const inProgressCourses = courses.filter((course) => course.progress < 100);
  const continueLearningCourses =
    inProgressCourses.length > 0 ? inProgressCourses : courses;

  const filledDaysFromEnd = Math.min(user.streak ?? 0, 7);
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const handleCarouselScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CARD_STRIDE);
    setActiveCourseIndex(index);
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={riseInStyle(headerEntrance)}>
        <View style={styles.header}>
          <View>
            <Text style={styles.dateText}>{todayLabel}</Text>
            <Text style={styles.greeting}>
              {getGreeting()}, {user.name} 👋
            </Text>
          </View>

          <ScalePressable
            onPress={onProfile}
            style={styles.avatarButton}
            scaleTo={PRESS_SCALE_BUTTON}
            accessibilityLabel="Open profile"
          >
            <Text style={styles.avatarButtonText}>{getInitials(user.name)}</Text>
          </ScalePressable>
        </View>
        </Animated.View>

        <Animated.View style={riseInStyle(heroEntrance)}>
        <LinearGradient
          colors={[colors.orange, colors.orangeDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>STREAK</Text>
              <Text style={styles.heroTitle}>Keep your streak alive</Text>
            </View>
            <View style={styles.flameBadge}>
              <Ionicons name="flame" size={18} color="#fff" />
            </View>
          </View>

          <Text style={styles.heroStreak}>{user.streak ?? 0} day streak</Text>
          <Text style={styles.heroSub}>You’re on a strong rhythm this week.</Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{animatedXp}</Text>
              <Text style={styles.heroStatLabel}>XP</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>#{currentUserEntry?.position ?? "—"}</Text>
              <Text style={styles.heroStatLabel}>Rank</Text>
            </View>
          </View>
        </LinearGradient>
        </Animated.View>

        <Animated.View style={riseInStyle(statsEntrance)}>
        <View style={styles.statsRow}>
          <ScalePressable wrapperStyle={styles.metricSlot} style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="star" size={16} color={colors.orangeDeep} />
            </View>
            <Text style={styles.metricValue}>{animatedXp}</Text>
            <Text style={styles.metricLabel}>XP</Text>
          </ScalePressable>

          <ScalePressable wrapperStyle={styles.metricSlot} style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="flame" size={16} color={colors.orangeDeep} />
            </View>
            <Text style={styles.metricValue}>{user.streak ?? 0}</Text>
            <Text style={styles.metricLabel}>Streak</Text>
          </ScalePressable>

          <ScalePressable wrapperStyle={styles.metricSlot} style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="trophy" size={16} color={colors.orangeDeep} />
            </View>
            <Text style={styles.metricValue}>#{currentUserEntry?.position ?? "—"}</Text>
            <Text style={styles.metricLabel}>Rank</Text>
          </ScalePressable>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>YOUR RHYTHM</Text>
            <Text style={styles.sectionMeta}>{user.streak ?? 0} days</Text>
          </View>

          <View style={styles.weekRow}>
            {WEEK_DAYS.map((label, index) => {
              const isFilled = index >= 7 - filledDaysFromEnd;
              return (
                <View key={index} style={styles.dayColumn}>
                  <View style={[styles.dayCircle, isFilled && styles.dayCircleFilled]}>
                    {isFilled && <Ionicons name="flame" size={12} color="#fff" />}
                  </View>
                  <Text style={styles.dayLabel}>{label}</Text>
                </View>
              );
            })}
          </View>
        </View>
        </Animated.View>

        <Animated.View style={riseInStyle(learningEntrance)}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>CONTINUE LEARNING</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_STRIDE}
          decelerationRate="fast"
          contentContainerStyle={styles.carousel}
          onMomentumScrollEnd={handleCarouselScroll}
          scrollEventThrottle={16}
        >
          {continueLearningCourses.map((course) => {
            const visual = getCourseVisual(course.title, colors);
            const nextLesson = getNextLessonTitle(course);

            return (
              // Outer slot keeps the width/margin + entrance; the pressable card sits inside it.
              <Animated.View key={course.id} style={[styles.courseSlot, riseInStyle(learningEntrance, 4)]}>
                {/*
                  The whole card opens the course. The Start/Continue button is a nested
                  pressable: the innermost pressable wins the touch, so tapping the button
                  fires only the button and tapping anywhere else fires only the card.
                */}
                <ScalePressable
                  onPress={() => onSelectCourse(course)}
                  style={styles.courseCard}
                  accessibilityLabel={`Open ${course.title}`}
                >
                  <View style={styles.courseTopRow}>
                    <View style={[styles.courseIconWrap, { backgroundColor: visual.bg }]}>
                      <Ionicons name={visual.icon} size={22} color={visual.color} />
                    </View>
                    {course.progress === 100 && (
                      <View style={styles.doneBadge}>
                        <Ionicons name="checkmark" size={12} color={colors.mint} />
                        <Text style={styles.doneBadgeText}>Done</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.courseTitle} numberOfLines={1}>{course.title}</Text>
                  <Text style={styles.courseDescription} numberOfLines={2}>{nextLesson || course.description}</Text>
                  <Text style={styles.progressText}>{course.completedLessons} / {course.totalLessons} lessons</Text>

                  <View style={styles.progressBackground}>
                    <View style={[styles.progressBar, { width: `${course.progress}%` }]} />
                  </View>

                  <DuoButton
                    label={course.progress > 0 ? "Continue" : "Start"}
                    variant="primary"
                    onPress={() => onSelectCourse(course)}
                    icon={<Ionicons name="arrow-forward" size={16} color="#fff" />}
                    style={styles.courseButton}
                  />
                </ScalePressable>
              </Animated.View>
            );
          })}
        </ScrollView>

        {continueLearningCourses.length > 1 && (
          <View style={styles.dotsRow}>
            {continueLearningCourses.map((course, index) => (
              <View key={course.id} style={[styles.dot, index === activeCourseIndex && styles.dotActive]} />
            ))}
          </View>
        )}

        <ScalePressable
          wrapperStyle={styles.coursesButton}
          onPress={onCourses}
          scaleTo={PRESS_SCALE_BUTTON}
          hitSlop={SMALL_HIT_SLOP}
          accessibilityLabel="View all courses"
        >
          <Text style={styles.coursesButtonText}>View all courses →</Text>
        </ScalePressable>
        </Animated.View>

        <Animated.View style={riseInStyle(rankingEntrance)}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>WEEKLY RANKING</Text>
          {/* Separate from the card (not nested in it), so it can never double-fire onRanking. */}
          <ScalePressable
            onPress={onRanking}
            scaleTo={PRESS_SCALE_BUTTON}
            hitSlop={SMALL_HIT_SLOP}
            accessibilityLabel="View full ranking"
          >
            <View style={styles.viewAllRow}>
              <Text style={styles.viewRanking}>View all</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.orangeDeep} />
            </View>
          </ScalePressable>
        </View>

        {/* The entire ranking card is one big button. */}
        <ScalePressable
          onPress={onRanking}
          style={styles.rankCard}
          accessibilityLabel="Open weekly ranking"
        >
          {(pressed) => (
            <>
              <LinearGradient
                colors={[colors.orangeLight, colors.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <View style={styles.podiumRow}>
                {podiumOrder.map((entry, index) => {
                  if (!entry) return <View key={index} style={styles.podiumSlot} />;
                  const isFirst = entry.position === 1;
                  return (
                    <View key={entry.id} style={styles.podiumSlot}>
                      <Ionicons name="trophy-outline" size={isFirst ? 18 : 16} color={isFirst ? colors.yellow : colors.textSecondary} />
                      <View style={[styles.podiumAvatar, isFirst && styles.podiumAvatarFirst, entry.isCurrentUser && styles.podiumAvatarSelf]}>
                        <Text style={styles.podiumAvatarText}>{getInitials(entry.name)}</Text>
                      </View>
                      <Text style={styles.podiumName} numberOfLines={1}>{entry.isCurrentUser ? "You" : entry.name}</Text>
                      <Text style={styles.podiumXp}>{entry.xp} XP</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.rankFooter}>
                <Text style={styles.rankFooterText}>See full leaderboard</Text>
                <Animated.View
                  style={{
                    transform: [
                      {
                        translateX: pressed.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 3],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="chevron-forward" size={14} color={colors.orangeDeep} />
                </Animated.View>
              </View>

              {/* Soft highlight that fades in while the card is held. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: colors.orange,
                    opacity: pressed.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.08],
                      extrapolate: "clamp",
                    }),
                  },
                ]}
              />
            </>
          )}
        </ScalePressable>
        </Animated.View>
      </ScrollView>

      <BottomNavBar
        active="home"
        onNavigate={(tab) => {
          if (tab === "home") return;
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile();
        }}
      />
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 120 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  dateText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  avatarButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.orange,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 4,
    borderBottomColor: colors.orangeDeep,
  },
  avatarButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },

  heroCard: { borderRadius: radius.xl, padding: 18, marginBottom: 18, borderBottomWidth: 5, borderBottomColor: colors.orangeDeep },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  heroEyebrow: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  flameBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  heroStreak: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -1, marginTop: 6 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4 },
  heroStatsRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  heroStat: { flex: 1 },
  heroStatValue: { color: "#fff", fontSize: 18, fontWeight: "800" },
  heroStatLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2, fontWeight: "700", letterSpacing: 0.6 },
  heroStatDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.35)", marginHorizontal: 12 },

  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, gap: 10 },
  // flex:1 moved to the Pressable wrapper so the three cards still share the row equally
  metricSlot: { flex: 1 },
  metricCard: { backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  metricIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.orangeLight, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  metricValue: { fontSize: 16, fontWeight: "800", color: colors.text },
  metricLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginTop: 2 },

  sectionCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: 0.4 },
  sectionMeta: { fontSize: 12, color: colors.orangeDeep, fontWeight: "800" },

  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  dayColumn: { alignItems: "center", gap: 8 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  dayCircleFilled: { backgroundColor: colors.orange, borderColor: colors.orange },
  dayLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted },

  carousel: { paddingRight: 16, paddingBottom: 8 },
  // width + margin moved here (outer slot); courseCard is now the pressable surface inside it
  courseSlot: { width: CARD_WIDTH, marginRight: 14 },
  courseCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 18, borderWidth: 1, borderColor: colors.border },
  courseTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  courseIconWrap: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  doneBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.mintLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  doneBadgeText: { color: colors.mint, fontSize: 11, fontWeight: "800" },
  courseTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 4 },
  courseDescription: { fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
  progressText: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 10 },
  progressBackground: { height: 10, borderRadius: 999, backgroundColor: colors.bgSecondary, overflow: "hidden", marginBottom: 14 },
  progressBar: { height: "100%", backgroundColor: colors.orange, borderRadius: 999 },
  courseButton: { marginTop: 4 },

  dotsRow: { flexDirection: "row", justifyContent: "center", marginTop: 10, marginBottom: 16, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.orange },

  // alignSelf/margin now live on the Pressable wrapper so the tap area is just the text (+ hitSlop)
  coursesButton: { alignSelf: "flex-end", marginBottom: 18 },
  coursesButtonText: { color: colors.orangeDeep, fontWeight: "800", fontSize: 13 },
  viewAllRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewRanking: { color: colors.orangeDeep, fontWeight: "800", fontSize: 12 },

  rankCard: { borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 22 },
  podiumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", minHeight: 100 },
  podiumSlot: { flex: 1, alignItems: "center" },
  podiumAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255, 122, 69, 0.14)", borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginVertical: 8 },
  podiumAvatarFirst: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255, 122, 69, 0.22)", borderColor: colors.yellow },
  podiumAvatarSelf: { borderColor: colors.orangeDeep },
  podiumAvatarText: { color: colors.text, fontWeight: "800", fontSize: 12 },
  podiumName: { color: colors.text, fontSize: 11, fontWeight: "700", marginBottom: 2 },
  podiumXp: { color: colors.textSecondary, fontSize: 10, fontWeight: "700" },

  rankFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2, marginTop: 12 },
  rankFooterText: { color: colors.orangeDeep, fontWeight: "800", fontSize: 12 },
});