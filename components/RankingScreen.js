import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ranking } from "../data/mockData";
import { colors, radius } from "../theme";
import BottomNavBar from "./BottomNavBar";

const PERIODS = ["Weekly", "Monthly", "Overall"];

const getXpForPeriod = (item, period) => {
  if (period === "Weekly" && typeof item.weeklyXp === "number") {
    return item.weeklyXp;
  }
  if (period === "Monthly" && typeof item.monthlyXp === "number") {
    return item.monthlyXp;
  }
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

const MEDAL_COLORS = {
  1: { bg: "#FFC800", dark: "#E5B200", icon: "trophy" }, // Gold
  2: { bg: "#CECECE", dark: "#AFAFAF", icon: "medal" },  // Silver
  3: { bg: "#CD7F32", dark: "#A05A1C", icon: "ribbon" }, // Bronze
};

export default function RankingScreen({
  student,
  onBack,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const [period, setPeriod] = useState("Weekly");

  const leaderboard = useMemo(() => {
    const otherStudents = ranking
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

    const combined = [...otherStudents, currentStudent].map((item) => ({
      ...item,
      periodXp: getXpForPeriod(item, period),
    }));

    return combined.sort((a, b) => b.periodXp - a.periodXp);
  }, [student, period]);

  const currentPosition =
    leaderboard.findIndex((item) => item.isCurrentUser) + 1;

  const currentXp =
    leaderboard.find((item) => item.isCurrentUser)?.periodXp ?? 0;

  const isTop1 = currentPosition === 1;

  const topThree = leaderboard.slice(0, 3);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors?.textMuted || "#777"} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>LEADERBOARD</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Period Selector Tabs */}
        <View style={styles.tabsContainer}>
          {PERIODS.map((item) => {
            const isActive = period === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.tab, isActive && styles.activeTab]}
                onPress={() => setPeriod(item)}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.tabText, isActive && styles.activeTabText]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Duolingo League Status Banner */}
        <View style={styles.leagueCard}>
          <View style={styles.leagueLeft}>
            <View style={styles.leagueIconBadge}>
              <Ionicons
                name={isTop1 ? "trophy" : "flash"}
                size={26}
                color="#FFF"
              />
            </View>
            <View>
              <Text style={styles.leagueTitle}>
                {period.toUpperCase()} LEAGUE
              </Text>
              <Text style={styles.leagueSub}>
                {isTop1 ? "You are leading the board! 🎉" : "Top learners rank up!"}
              </Text>
            </View>
          </View>

          <View style={styles.rankPill}>
            <Text style={styles.rankPillHash}>#</Text>
            <Text style={styles.rankPillNum}>{currentPosition}</Text>
          </View>
        </View>

        {/* Top 3 Podium Section */}
        {topThree.length >= 3 && (
          <View style={styles.podiumContainer}>
            {/* Rank 2 (Silver) */}
            <View style={[styles.podiumItem, styles.podiumSecond]}>
              <View style={[styles.podiumAvatar, { borderColor: MEDAL_COLORS[2].bg }]}>
                <Text style={styles.podiumAvatarText}>{getInitials(topThree[1]?.name)}</Text>
                <View style={[styles.podiumMedalBadge, { backgroundColor: MEDAL_COLORS[2].bg }]}>
                  <Text style={styles.podiumMedalText}>2</Text>
                </View>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>
                {topThree[1]?.isCurrentUser ? "You" : topThree[1]?.name}
              </Text>
              <View style={styles.xpTag}>
                <Ionicons name="flash" size={12} color={colors?.gold || "#FFC800"} />
                <Text style={styles.xpTagText}>{topThree[1]?.periodXp} XP</Text>
              </View>
            </View>

            {/* Rank 1 (Gold - Center & Elevated) */}
            <View style={[styles.podiumItem, styles.podiumFirst]}>
              <View style={styles.crownIcon}>
                <Ionicons name="trophy" size={22} color={colors?.gold || "#FFC800"} />
              </View>
              <View style={[styles.podiumAvatar, styles.podiumAvatarFirst, { borderColor: MEDAL_COLORS[1].bg }]}>
                <Text style={styles.podiumAvatarText}>{getInitials(topThree[0]?.name)}</Text>
                <View style={[styles.podiumMedalBadge, { backgroundColor: MEDAL_COLORS[1].bg }]}>
                  <Text style={styles.podiumMedalText}>1</Text>
                </View>
              </View>
              <Text style={[styles.podiumName, styles.podiumNameFirst]} numberOfLines={1}>
                {topThree[0]?.isCurrentUser ? "You" : topThree[0]?.name}
              </Text>
              <View style={[styles.xpTag, styles.xpTagFirst]}>
                <Ionicons name="flash" size={12} color="#FFF" />
                <Text style={[styles.xpTagText, { color: "#FFF" }]}>{topThree[0]?.periodXp} XP</Text>
              </View>
            </View>

            {/* Rank 3 (Bronze) */}
            <View style={[styles.podiumItem, styles.podiumThird]}>
              <View style={[styles.podiumAvatar, { borderColor: MEDAL_COLORS[3].bg }]}>
                <Text style={styles.podiumAvatarText}>{getInitials(topThree[2]?.name)}</Text>
                <View style={[styles.podiumMedalBadge, { backgroundColor: MEDAL_COLORS[3].bg }]}>
                  <Text style={styles.podiumMedalText}>3</Text>
                </View>
              </View>
              <Text style={styles.podiumName} numberOfLines={1}>
                {topThree[2]?.isCurrentUser ? "You" : topThree[2]?.name}
              </Text>
              <View style={styles.xpTag}>
                <Ionicons name="flash" size={12} color={colors?.gold || "#FFC800"} />
                <Text style={styles.xpTagText}>{topThree[2]?.periodXp} XP</Text>
              </View>
            </View>
          </View>
        )}

        {/* Full Leaderboard List */}
        <View style={styles.listContainer}>
          <Text style={styles.listHeaderTitle}>ALL LEARNERS</Text>

          {leaderboard.map((item, index) => {
            const position = index + 1;
            const isTopThree = position <= 3;
            const medal = MEDAL_COLORS[position];

            return (
              <View
                key={item.id}
                style={[
                  styles.userRow,
                  item.isCurrentUser && styles.currentUserRow,
                ]}
              >
                {/* Position / Medal */}
                <View style={styles.rankCol}>
                  {isTopThree ? (
                    <View
                      style={[
                        styles.listMedal,
                        { backgroundColor: medal.bg, borderBottomColor: medal.dark },
                      ]}
                    >
                      <Ionicons name={medal.icon} size={14} color="#FFF" />
                    </View>
                  ) : (
                    <Text style={styles.rankNum}>{position}</Text>
                  )}
                </View>

                {/* Avatar */}
                <View
                  style={[
                    styles.avatar,
                    item.isCurrentUser && styles.avatarSelf,
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      item.isCurrentUser && styles.avatarTextSelf,
                    ]}
                  >
                    {getInitials(item.name)}
                  </Text>
                </View>

                {/* User Info */}
                <View style={styles.userInfo}>
                  <Text
                    style={[
                      styles.userName,
                      item.isCurrentUser && styles.currentUserName,
                    ]}
                    numberOfLines={1}
                  >
                    {item.isCurrentUser ? "You" : item.name}
                  </Text>
                </View>

                {/* XP Score Badge */}
                <View style={styles.scoreCol}>
                  <Text style={styles.xpText}>{item.periodXp}</Text>
                  <Text style={styles.xpLabel}>XP</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors?.screenBg || "#FFFFFF",
  },

  container: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 110,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F7F7F7",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors?.border || "#E5E5E5",
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: colors?.textMuted || "#777",
    letterSpacing: 1.2,
  },

  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#F7F7F7",
    borderRadius: radius?.lg || 16,
    padding: 4,
    borderWidth: 2,
    borderColor: colors?.border || "#E5E5E5",
    marginBottom: 20,
  },

  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radius?.md || 12,
  },

  activeTab: {
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: colors?.border || "#E5E5E5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  tabText: {
    fontWeight: "800",
    color: colors?.textMuted || "#777",
    fontSize: 13,
  },

  activeTabText: {
    color: colors?.blue || "#1CB0F6",
  },

  leagueCard: {
    backgroundColor: colors?.gold || "#FFC800",
    borderRadius: radius?.lg || 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 5,
    borderBottomColor: "#E5B200",
    marginBottom: 24,
  },

  leagueLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  leagueIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },

  leagueTitle: {
    color: "#4A3900",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  leagueSub: {
    color: "rgba(74,57,0,0.8)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  rankPill: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius?.full || 20,
    borderBottomWidth: 3,
    borderBottomColor: colors?.border || "#E5E5E5",
  },

  rankPillHash: {
    fontSize: 14,
    fontWeight: "900",
    color: "#4A3900",
    marginRight: 2,
  },

  rankPillNum: {
    fontSize: 20,
    fontWeight: "900",
    color: "#4A3900",
  },

  podiumContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    marginBottom: 28,
    paddingHorizontal: 10,
    gap: 12,
  },

  podiumItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#F7F7F7",
    borderRadius: radius?.lg || 16,
    padding: 12,
    borderWidth: 2,
    borderColor: colors?.border || "#E5E5E5",
    borderBottomWidth: 4,
    borderBottomColor: colors?.border || "#E5E5E5",
  },

  podiumFirst: {
    backgroundColor: "#FFF8E1",
    borderColor: colors?.gold || "#FFC800",
    borderBottomColor: "#E5B200",
    marginTop: -16,
    paddingVertical: 16,
  },

  podiumSecond: {
    marginTop: 10,
  },

  podiumThird: {
    marginTop: 10,
  },

  crownIcon: {
    marginBottom: -6,
    zIndex: 2,
  },

  podiumAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    position: "relative",
    marginBottom: 8,
  },

  podiumAvatarFirst: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },

  podiumAvatarText: {
    fontSize: 16,
    fontWeight: "900",
    color: colors?.text || "#4B4B4B",
  },

  podiumMedalBadge: {
    position: "absolute",
    bottom: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },

  podiumMedalText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "900",
  },

  podiumName: {
    fontSize: 13,
    fontWeight: "800",
    color: colors?.text || "#4B4B4B",
    marginBottom: 6,
  },

  podiumNameFirst: {
    fontSize: 14,
    fontWeight: "900",
  },

  xpTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors?.border || "#E5E5E5",
  },

  xpTagFirst: {
    backgroundColor: colors?.gold || "#FFC800",
    borderColor: "#E5B200",
  },

  xpTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors?.text || "#4B4B4B",
  },

  listContainer: {
    backgroundColor: "#FFF",
    borderRadius: radius?.lg || 20,
    borderWidth: 2,
    borderColor: colors?.border || "#E5E5E5",
    padding: 12,
  },

  listHeaderTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: colors?.textMuted || "#777",
    letterSpacing: 1,
    marginVertical: 8,
    marginLeft: 8,
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius?.md || 12,
    marginVertical: 2,
  },

  currentUserRow: {
    backgroundColor: "#E5F6FF",
    borderWidth: 2,
    borderColor: colors?.blue || "#1CB0F6",
    borderBottomWidth: 4,
  },

  rankCol: {
    width: 32,
    alignItems: "center",
  },

  rankNum: {
    fontSize: 15,
    fontWeight: "900",
    color: colors?.textMuted || "#777",
  },

  listMedal: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 2,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F7F7F7",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 12,
    borderWidth: 2,
    borderColor: colors?.border || "#E5E5E5",
  },

  avatarSelf: {
    borderColor: colors?.blue || "#1CB0F6",
    backgroundColor: "#FFF",
  },

  avatarText: {
    fontSize: 14,
    fontWeight: "900",
    color: colors?.textMuted || "#777",
  },

  avatarTextSelf: {
    color: colors?.blue || "#1CB0F6",
  },

  userInfo: {
    flex: 1,
  },

  userName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors?.text || "#4B4B4B",
  },

  currentUserName: {
    color: colors?.blue || "#1CB0F6",
    fontWeight: "900",
  },

  scoreCol: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },

  xpText: {
    fontSize: 15,
    fontWeight: "900",
    color: colors?.text || "#4B4B4B",
  },

  xpLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors?.textMuted || "#777",
  },
});