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

import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";
import XpProgressRing from "./XpProgressRing";
import DuoButton from "./DuoButton";

const getInitials = (name) => {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

export default function ProfileScreen({
  user,
  ranking,
  onBack,
  onLogout,
  onHome,
  onCourses,
  onRanking,
}) {
  const { colors, theme, themes, themeId, setThemeId } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const position = useMemo(() => {
    const others = ranking.filter((item) => item.id !== user.id);
    const combined = [...others, { id: user.id, xp: user.xp }].sort(
      (a, b) => b.xp - a.xp
    );
    return combined.findIndex((item) => item.id === user.id) + 1;
  }, [user, ranking]);

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

        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
          </View>

          <Text style={styles.name}>{user.name}</Text>
          {user.role && <Text style={styles.roleText}>{user.role}</Text>}
        </View>

        <LinearGradient
          colors={[colors.orange, colors.orangeDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsCard}
        >
          <XpProgressRing xp={user.xp} size={74} strokeWidth={7} />
          <View style={styles.statsDivider} />

          <View style={styles.statBlock}>
            <Text style={styles.statValue}>⭐ {user.xp}</Text>
            <Text style={styles.statLabel}>XP</Text>
          </View>

          <View style={styles.statBlock}>
            <Text style={styles.statValue}>🔥 {user.streak}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>

          <View style={styles.statBlock}>
            <Text style={styles.statValue}>#{position}</Text>
            <Text style={styles.statLabel}>Rank</Text>
          </View>
        </LinearGradient>

        {/* Theme picker */}
        <View style={styles.themeCard}>
          <View style={styles.themeHeader}>
            <Text style={styles.sectionTitle}>Theme</Text>
            <View style={styles.themeNamePill}>
              <Text style={styles.themeNameText}>{theme.name}</Text>
            </View>
          </View>

          <View style={styles.themeGrid}>
            {themes.map((item) => {
              const selected = item.id === themeId;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.themeCell}
                  onPress={() => setThemeId(item.id)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} theme`}
                  accessibilityState={{ selected }}
                >
                  <View
                    style={[
                      styles.swatchRing,
                      { backgroundColor: item.light },
                      selected && {
                        borderColor: item.deep,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.swatchDot,
                        {
                          backgroundColor: item.primary,
                          borderBottomColor: item.deep,
                        },
                      ]}
                    >
                      {selected && (
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      )}
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.swatchLabel,
                      selected && styles.swatchLabelSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.coachCard}>
          <View style={styles.coachHeader}>
            <Text style={styles.sectionTitle}>Customize your coach</Text>
            <View style={styles.coachTinyIcon}>
              <Ionicons name="sparkles" size={16} color={colors.orangeDeep} />
            </View>
          </View>

          <View style={styles.coachBody}>
            <View style={styles.coachAvatar}>
              <Ionicons name="school" size={32} color="#fff" />
            </View>
            <View style={styles.coachTextBlock}>
              <Text style={styles.coachName}>EA Coach</Text>
              <Text style={styles.coachText}>
                Stay consistent and keep your momentum going.
              </Text>
            </View>
          </View>

          <DuoButton
            label="Adjust Coach"
            variant="secondary"
            onPress={() => {}}
            icon={
              <Ionicons
                name="options-outline"
                size={18}
                color={colors.orangeDeep}
              />
            }
            style={styles.coachButton}
          />
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={colors.orangeDeep}
              />
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
                    color={colors.orangeDeep}
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

// Styles are built from the active theme's colors. StyleSheet.create at module
// level would freeze the colors at app start, so this runs inside useMemo.
const createStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenBg },
    container: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 120 },

    header: { flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 20 },
    backButton: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
    headerTitle: { flex: 1, fontSize: 24, fontWeight: "900", textAlign: "center", color: colors.text },
    headerSpacer: { width: 36 },

    identityCard: { alignItems: "center", marginBottom: 22 },
    avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center", marginBottom: 12, borderBottomWidth: 5, borderBottomColor: colors.orangeDeep },
    avatarText: { color: "#fff", fontSize: 28, fontWeight: "900" },
    name: { fontSize: 28, fontWeight: "900", color: colors.text },
    roleText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginTop: 4 },

    statsCard: { flexDirection: "row", alignItems: "center", borderRadius: radius.xl, padding: 18, marginBottom: 24 },
    statsDivider: { width: 1, height: 42, backgroundColor: "rgba(255,255,255,0.4)", marginHorizontal: 10 },
    statBlock: { flex: 1, alignItems: "center" },
    statValue: { color: "#fff", fontSize: 16, fontWeight: "800" },
    statLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 4, fontWeight: "700" },

    themeCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 22 },
    themeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    themeNamePill: { backgroundColor: colors.orangeLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
    themeNameText: { fontSize: 12, fontWeight: "800", color: colors.orangeDeep },
    themeGrid: { flexDirection: "row", flexWrap: "wrap" },
    themeCell: { width: "25%", alignItems: "center", marginBottom: 14 },
    swatchRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
    swatchDot: { width: 40, height: 40, borderRadius: 20, borderBottomWidth: 3, alignItems: "center", justifyContent: "center" },
    swatchLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginTop: 6 },
    swatchLabelSelected: { color: colors.text },

    coachCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 22 },
    coachHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
    coachTinyIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.orangeLight, alignItems: "center", justifyContent: "center" },
    coachBody: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    coachAvatar: { width: 58, height: 58, borderRadius: 22, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center", marginRight: 12 },
    coachTextBlock: { flex: 1 },
    coachName: { fontSize: 18, fontWeight: "800", color: colors.text },
    coachText: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    coachButton: { marginTop: 4 },

    infoCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 6, marginTop: 10, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
    infoRow: { flexDirection: "row", alignItems: "center", padding: 12 },
    infoIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.orangeLight, alignItems: "center", justifyContent: "center", marginRight: 12 },
    infoTextBlock: { flex: 1 },
    infoLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
    infoValue: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 2 },
    infoDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 12 },
  });