import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { ranking } from "../data/mockData";
import { colors, radius } from "../theme";
import BottomNavBar from "./BottomNavBar";
import XpProgressRing from "./XpProgressRing";
import DuoButton from "./DuoButton";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.72;
const CARD_STRIDE = CARD_WIDTH + 14;
const WEEK_DAYS = ["M", "T", "W", "T", "F", "S", "S"];

const getInitials = (name) => {
  if (!name) {
    return "?";
  }

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

// Simple heuristic to give each subject its own icon/color since
// the data doesn't carry a category field yet.
const getCourseVisual = (title = "") => {
  const lower = title.toLowerCase();

  if (/python|code|javascript|programming|script/.test(lower)) {
    return { icon: "code-slash", color: colors.blue, bg: colors.blueLight };
  }

  if (/english|spanish|french|language/.test(lower)) {
    return { icon: "language", color: colors.purple, bg: "#f3e6ff" };
  }

  return { icon: "book", color: colors.green, bg: colors.greenBg };
};

const getNextLessonTitle = (course) => {
  for (const module of course.modules || []) {
    const next = module.lessons.find((lesson) => !lesson.completed);
    if (next) {
      return next.title;
    }
  }
  return null;
};

const useCountUp = (target, duration = 600) => {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    const diff = target - from;

    if (diff === 0) {
      return;
    }

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
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.Text
      style={[
        styles.flameEmoji,
        { fontSize: size, transform: [{ scale: pulse }] },
      ]}
    >
      🔥
    </Animated.Text>
  );
}

export default function HomeScreen({
  user,
  courses,
  onProfile,
  onCourses,
  onRanking,
  onSelectCourse,
}) {
  const animatedXp = useCountUp(user.xp);
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);

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
  const currentUserInPodium = podium.some((item) => item.isCurrentUser);
  const nextFew = leaderboard.slice(3, 5);

  const inProgressCourses = courses.filter((course) => course.progress < 100);
  const continueLearningCourses =
    inProgressCourses.length > 0 ? inProgressCourses : courses;

  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);
  const podiumHeights = { 0: 78, 1: 100, 2: 64 };
  const MEDAL_COLORS = { 1: colors.gold, 2: "#c0c0c0", 3: "#cd7f32" };

  // Approximate weekly streak calendar: fills the most recent
  // `streak` days (capped at 7) since there's no per-day activity
  // log in the data yet — purely a visual approximation.
  const filledDaysFromEnd = Math.min(user.streak ?? 0, 7);

  const handleCarouselScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CARD_STRIDE);
    setActiveCourseIndex(index);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {getGreeting()}, {user.name} 👋
            </Text>
            <Text style={styles.subtitle}>Welcome back to EA</Text>
          </View>

          <TouchableOpacity onPress={onProfile} style={styles.avatarButton}>
            <Text style={styles.avatarButtonText}>
              {getInitials(user.name)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats: XP ring + streak + rank */}
        <LinearGradient
          colors={[colors.green, colors.greenDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsCard}
        >
          <XpProgressRing xp={user.xp} />

          <View style={styles.statsDivider} />

          <View style={styles.statBlock}>
            <Text style={styles.statValueLight}>⭐ {animatedXp}</Text>
            <Text style={styles.statLabelLight}>Total XP</Text>
          </View>

          <View style={styles.statBlock}>
            <View style={styles.streakRow}>
              <StreakFlame />
              <Text style={styles.statValueLight}>{user.streak}</Text>
            </View>
            <Text style={styles.statLabelLight}>Day Streak</Text>
          </View>

          <View style={styles.statBlock}>
            <Text style={styles.statValueLight}>
              #{currentUserEntry?.position ?? "—"}
            </Text>
            <Text style={styles.statLabelLight}>Rank</Text>
          </View>
        </LinearGradient>

        {/* Weekly streak calendar */}
        <View style={styles.streakCard}>
          <View style={styles.streakCardHeader}>
            <StreakFlame size={18} />
            <Text style={styles.streakCardTitle}>This Week</Text>
          </View>

          <View style={styles.weekRow}>
            {WEEK_DAYS.map((label, index) => {
              const isFilled = index >= 7 - filledDaysFromEnd;

              return (
                <View key={index} style={styles.dayColumn}>
                  <View
                    style={[
                      styles.dayCircle,
                      isFilled && styles.dayCircleFilled,
                    ]}
                  >
                    {isFilled && (
                      <Ionicons name="flame" size={14} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.dayLabel}>{label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Continue Learning — horizontal carousel */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Continue Learning</Text>
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
            const visual = getCourseVisual(course.title);
            const nextLesson = getNextLessonTitle(course);

            return (
              <View key={course.id} style={styles.courseCard}>
                <View style={styles.courseTopRow}>
                  <View
                    style={[
                      styles.courseIconWrap,
                      { backgroundColor: visual.bg },
                    ]}
                  >
                    <Ionicons name={visual.icon} size={20} color={visual.color} />
                  </View>

                  {course.progress === 100 && (
                    <View style={styles.doneBadge}>
                      <Ionicons
                        name="checkmark"
                        size={12}
                        color={colors.greenDark}
                      />
                      <Text style={styles.doneBadgeText}>Done</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.courseTitle} numberOfLines={1}>
                  {course.title}
                </Text>

                <Text style={styles.courseDescription} numberOfLines={1}>
                  {nextLesson ? `Next: ${nextLesson}` : course.description}
                </Text>

                <Text style={styles.progressText}>
                  {course.completedLessons} / {course.totalLessons} lessons
                </Text>

                <View style={styles.progressBackground}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${course.progress}%` },
                    ]}
                  />
                </View>

                <DuoButton
                  label={course.progress > 0 ? "Continue" : "Start"}
                  variant="primary"
                  onPress={() => onSelectCourse(course)}
                  icon={<Ionicons name="arrow-forward" size={16} color="#fff" />}
                />
              </View>
            );
          })}
        </ScrollView>

        {continueLearningCourses.length > 1 && (
          <View style={styles.dotsRow}>
            {continueLearningCourses.map((course, index) => (
              <View
                key={course.id}
                style={[
                  styles.dot,
                  index === activeCourseIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.coursesButton} onPress={onCourses}>
          <Text style={styles.coursesButtonText}>View All Courses →</Text>
        </TouchableOpacity>

        {/* Leaderboard */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>🏆 Weekly Ranking</Text>

          <TouchableOpacity onPress={onRanking}>
            <Text style={styles.viewRanking}>View All</Text>
          </TouchableOpacity>
        </View>

        <LinearGradient
          colors={[colors.purple, colors.purpleDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.leaderboardCard}
        >
          <View style={styles.podiumRow}>
            {podiumOrder.map((entry, slot) => {
              if (!entry) {
                return <View key={slot} style={styles.podiumSlot} />;
              }

              const isFirst = entry.position === 1;
              const medalColor = MEDAL_COLORS[entry.position];

              return (
                <View
                  key={entry.id}
                  style={[styles.podiumSlot, { justifyContent: "flex-end" }]}
                >
                  <Ionicons
                    name="trophy"
                    size={isFirst ? 26 : 18}
                    color={medalColor}
                    style={styles.medal}
                  />

                  <View
                    style={[
                      styles.podiumAvatar,
                      isFirst && styles.podiumAvatarFirst,
                      entry.isCurrentUser && styles.podiumAvatarSelf,
                    ]}
                  >
                    <Text
                      style={[
                        styles.podiumAvatarText,
                        isFirst && styles.podiumAvatarTextFirst,
                      ]}
                    >
                      {getInitials(entry.name)}
                    </Text>
                  </View>

                  <Text style={styles.podiumName} numberOfLines={1}>
                    {entry.isCurrentUser ? "You" : entry.name}
                  </Text>

                  <Text style={styles.podiumXp}>{entry.xp} XP</Text>

                  <View
                    style={[
                      styles.podiumBar,
                      {
                        height: podiumHeights[slot],
                        backgroundColor: `${medalColor}55`,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>

          {nextFew.length > 0 && (
            <View style={styles.restList}>
              {nextFew.map((entry) => (
                <View key={entry.id} style={styles.restRow}>
                  <Text style={styles.restPosition}>#{entry.position}</Text>
                  <Text style={styles.restName} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text style={styles.restXp}>{entry.xp} XP</Text>
                </View>
              ))}
            </View>
          )}

          {!currentUserInPodium && currentUserEntry && (
            <View style={styles.yourPositionCard}>
              <Text style={styles.restPosition}>
                #{currentUserEntry.position}
              </Text>
              <Text style={styles.restName}>You</Text>
              <Text style={styles.restXp}>{currentUserEntry.xp} XP</Text>
            </View>
          )}
        </LinearGradient>
      </ScrollView>

      <BottomNavBar
        active="home"
        onNavigate={(tab) => {
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },

  container: {
    flex: 1,
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 110,
  },

  header: {
    marginTop: 40,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  greeting: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },

  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },

  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
  },

  avatarButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },

  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 16,
  },

  statsDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginHorizontal: 10,
  },

  statBlock: {
    flex: 1,
    alignItems: "center",
  },

  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  flameEmoji: {
    fontSize: 16,
  },

  statValueLight: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  statLabelLight: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },

  streakCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 28,
    borderWidth: 2,
    borderColor: colors.border,
  },

  streakCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },

  streakCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  dayColumn: {
    alignItems: "center",
    gap: 6,
  },

  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgMuted,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },

  dayCircleFilled: {
    backgroundColor: colors.gold,
    borderColor: colors.goldDark,
  },

  dayLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: colors.text,
  },

  viewRanking: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.purple,
  },

  carousel: {
    paddingRight: 20,
    paddingBottom: 4,
  },

  courseCard: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 18,
    marginRight: 14,
    borderWidth: 2,
    borderColor: colors.border,
  },

  courseTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  courseIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },

  courseTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
  },

  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.greenBg,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  doneBadgeText: {
    color: colors.greenDark,
    fontSize: 11,
    fontWeight: "800",
  },

  courseDescription: {
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: "600",
  },

  progressText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },

  progressBackground: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    marginTop: 8,
    marginBottom: 16,
    overflow: "hidden",
  },

  progressBar: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.green,
  },

  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },

  dotActive: {
    backgroundColor: colors.green,
    width: 18,
  },

  coursesButton: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 28,
    borderWidth: 2,
    borderColor: colors.border,
  },

  coursesButtonText: {
    fontWeight: "700",
    color: colors.text,
  },

  leaderboardCard: {
    borderRadius: radius.lg + 4,
    padding: 20,
    marginBottom: 24,
  },

  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  podiumSlot: {
    flex: 1,
    alignItems: "center",
  },

  medal: {
    marginBottom: 4,
  },

  podiumAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },

  podiumAvatarFirst: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },

  podiumAvatarSelf: {
    borderWidth: 3,
    borderColor: colors.gold,
  },

  podiumAvatarText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },

  podiumAvatarTextFirst: {
    fontSize: 16,
  },

  podiumName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 80,
  },

  podiumXp: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginBottom: 8,
    fontWeight: "600",
  },

  podiumBar: {
    width: "70%",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },

  restList: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 12,
  },

  restRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },

  restPosition: {
    width: 32,
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },

  restName: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  restXp: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    fontSize: 13,
  },

  yourPositionCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,200,0,0.2)",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});