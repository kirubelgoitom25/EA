import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { ranking } from "../data/mockData";
import { colors, radius } from "../theme";
import BottomNavBar from "./BottomNavBar";
import XpProgressRing from "./XpProgressRing";
import DuoButton from "./DuoButton";

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

export default function ProfileScreen({
  user,
  onBack,
  onLogout,
  onHome,
  onCourses,
  onRanking,
}) {
  const position = useMemo(() => {
    const others = ranking.filter((item) => item.id !== user.id);

    const combined = [...others, { id: user.id, xp: user.xp }].sort(
      (a, b) => b.xp - a.xp
    );

    return combined.findIndex((item) => item.id === user.id) + 1;
  }, [user]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Profile</Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
          </View>

          <Text style={styles.name}>{user.name}</Text>

          {user.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user.role}</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <LinearGradient
          colors={[colors.green, colors.greenDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsCard}
        >
          <XpProgressRing xp={user.xp} />

          <View style={styles.statsDivider} />

          <View style={styles.statBlock}>
            <Text style={styles.statValue}>⭐ {user.xp}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>

          <View style={styles.statBlock}>
            <Text style={styles.statValue}>🔥 {user.streak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>

          <View style={styles.statBlock}>
            <Text style={styles.statValue}>#{position}</Text>
            <Text style={styles.statLabel}>Rank</Text>
          </View>
        </LinearGradient>

        {/* Account info */}
        <Text style={styles.sectionTitle}>Account</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="mail-outline" size={18} color={colors.blue} />
            </View>

            <View style={styles.infoTextBlock}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user.email}</Text>
            </View>
          </View>

          {user.role && (
            <>
              <View style={styles.infoDivider} />

              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons
                    name="briefcase-outline"
                    size={18}
                    color={colors.blue}
                  />
                </View>

                <View style={styles.infoTextBlock}>
                  <Text style={styles.infoLabel}>Role</Text>
                  <Text style={styles.infoValue}>{user.role}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        <DuoButton
          label="Log out"
          variant="danger"
          onPress={onLogout}
          icon={<Ionicons name="log-out-outline" size={18} color="#fff" />}
        />
      </ScrollView>

      <BottomNavBar
        active="profile"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
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
    flexDirection: "row",
    alignItems: "center",
    marginTop: 40,
    marginBottom: 10,
  },

  backButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginRight: 36,
    color: colors.text,
  },

  headerSpacer: {
    width: 36,
  },

  identity: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 24,
  },

  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.blue,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderBottomWidth: 5,
    borderBottomColor: colors.blueDark,
  },

  avatarText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },

  name: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },

  roleBadge: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },

  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },

  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 28,
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

  statValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  statLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
    color: colors.text,
  },

  infoCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 6,
    marginBottom: 28,
    borderWidth: 2,
    borderColor: colors.border,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },

  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.blueLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  infoTextBlock: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },

  infoValue: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
    color: colors.text,
  },

  infoDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 60,
  },
});
