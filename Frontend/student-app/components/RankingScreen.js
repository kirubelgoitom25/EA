import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";

const PERIODS = ["Weekly", "Monthly", "Overall"];

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

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>RANKING</Text>
          <View style={{ width: 36 }} />
        </View>

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
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.userCard}>
          <View style={styles.userCardLeft}>
            <View style={styles.userBadge}>
              <Ionicons name="flash" size={20} color="#fff" />
            </View>
            <View>
              <Text style={styles.userCardLabel}>Your position</Text>
              <Text style={styles.userCardValue}>#{currentPosition}</Text>
            </View>
          </View>

          <View style={styles.userCardStat}>
            <Text style={styles.userCardStatValue}>{currentXp}</Text>
            <Text style={styles.userCardStatLabel}>XP</Text>
          </View>
        </View>

        {topThree.length >= 3 && (
          <View style={styles.podiumCard}>
            <View style={styles.podiumRow}>
              {[topThree[1], topThree[0], topThree[2]].map((entry, index) => {
                if (!entry) return <View key={index} style={styles.podiumSlot} />;
                const isFirst = index === 1;
                return (
                  <View key={entry.id} style={styles.podiumSlot}>
                    <Text style={styles.podiumRank}>#{index === 1 ? 1 : index === 0 ? 2 : 3}</Text>
                    <View style={[styles.podiumAvatar, isFirst && styles.podiumAvatarFirst, entry.isCurrentUser && styles.podiumAvatarSelf]}>
                      <Text style={styles.podiumAvatarText}>{getInitials(entry.name)}</Text>
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{entry.isCurrentUser ? "You" : entry.name}</Text>
                    <Text style={styles.podiumXp}>{entry.periodXp} XP</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.listWrap}>
          <Text style={styles.listHeader}>ALL LEARNERS</Text>
          {leaderboard.map((item, index) => (
            <View key={item.id} style={[styles.userRow, item.isCurrentUser && styles.currentUserRow]}>
              <Text style={styles.rankNum}>{index + 1}</Text>

              <View style={[styles.avatar, item.isCurrentUser && styles.avatarSelf]}>
                <Text style={[styles.avatarText, item.isCurrentUser && styles.avatarTextSelf]}>{getInitials(item.name)}</Text>
              </View>

              <View style={styles.userInfo}>
                <Text style={[styles.userName, item.isCurrentUser && styles.currentUserName]} numberOfLines={1}>
                  {item.isCurrentUser ? "You" : item.name}
                </Text>
                <Text style={styles.userMeta}>{item.periodXp} XP</Text>
              </View>

              <View style={styles.streakCol}>
                <Ionicons name="flame" size={14} color={colors.orangeDeep} />
                <Text style={styles.streakText}>{item.streak ?? 0}</Text>
              </View>
            </View>
          ))}
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

const createStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.screenBg },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 44, paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  headerTitle: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },

  tabsContainer: { flexDirection: "row", backgroundColor: colors.card, borderRadius: radius.xl, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: radius.md },
  activeTab: { backgroundColor: colors.orange },
  tabText: { fontWeight: "800", color: colors.textMuted, fontSize: 13 },
  activeTabText: { color: "#fff" },

  userCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, marginBottom: 18 },
  userCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  userBadge: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center" },
  userCardLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  userCardValue: { fontSize: 24, fontWeight: "900", color: colors.text },
  userCardStat: { alignItems: "flex-end" },
  userCardStatValue: { fontSize: 18, fontWeight: "800", color: colors.orangeDeep },
  userCardStatLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },

  podiumCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 18 },
  podiumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  podiumSlot: { flex: 1, alignItems: "center" },
  podiumRank: { fontSize: 12, fontWeight: "800", color: colors.textMuted, marginBottom: 8 },
  podiumAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.orangeLight, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  podiumAvatarFirst: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.yellow },
  podiumAvatarSelf: { borderColor: colors.orangeDeep },
  podiumAvatarText: { fontWeight: "800", color: colors.text },
  podiumName: { fontSize: 11, fontWeight: "700", color: colors.text },
  podiumXp: { fontSize: 10, fontWeight: "700", color: colors.textSecondary },

  listWrap: { backgroundColor: colors.card, borderRadius: radius.xl, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  listHeader: { fontSize: 12, fontWeight: "800", color: colors.textMuted, letterSpacing: 1, marginHorizontal: 16, marginTop: 10, marginBottom: 8 },
  userRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  currentUserRow: { backgroundColor: colors.orangeLight },
  rankNum: { width: 24, fontWeight: "800", color: colors.textMuted, fontSize: 13 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarSelf: { backgroundColor: colors.orange },
  avatarText: { fontSize: 12, fontWeight: "800", color: colors.text },
  avatarTextSelf: { color: "#fff" },
  userInfo: { flex: 1 },
  userName: { fontWeight: "800", color: colors.text },
  currentUserName: { color: colors.orangeDeep },
  userMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  streakCol: { flexDirection: "row", alignItems: "center", gap: 4 },
  streakText: { fontSize: 12, fontWeight: "800", color: colors.text },
});
