import React from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { feedback, useFeedbackSettings } from "../services/feedback";
import { space, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import AppText from "./ui/AppText";
import { initials } from "./rankingModel";
import Button from "./ui/Button";
import Screen from "./ui/Screen";

// Profile: who you are, your numbers, and your settings.
export default function ProfileScreen({ user, onLogout, onHome, onCourses, onRanking, onProfile }) {
  const { sound, haptics } = useFeedbackSettings();
  const xp = Number(user.xp) || 0;
  const streak = Math.max(Number(user.streak) || 0, 0);
  const weekly = Number(user.weeklyXp) || 0;

  return (
    <View style={styles.root}>
      <Screen withTabBar contentStyle={styles.content}>
        <View style={styles.identity}>
          <FoxAvatar name={user.name} />
          <AppText variant="display" style={styles.name} numberOfLines={2}>
            {user.name}
          </AppText>
          {user.email ? (
            <AppText tone="secondary" numberOfLines={1}>
              {user.email}
            </AppText>
          ) : null}
        </View>

        <View style={styles.stats}>
          <Stat value={streak} label="Day streak" icon={<TailFlame />} />
          <Stat value={xp} label="Total XP" icon={<Ionicons name="star" size={18} color={tokens.accent} />} />
          <Stat value={weekly} label="This week" icon={<Ionicons name="trending-up" size={18} color={tokens.accent} />} />
        </View>

        <AppText variant="overline" tone="secondary" style={styles.sectionTitle}>
          SETTINGS
        </AppText>
        <SettingRow
          label="Sound effects"
          value={sound}
          onChange={(value) => {
            feedback.setSoundEnabled(value);
            if (value) feedback.button();
          }}
          divider
        />
        <SettingRow
          label="Haptics"
          value={haptics}
          onChange={(value) => {
            feedback.setHapticsEnabled(value);
            if (value) feedback.button();
          }}
        />

        <AppText variant="caption" tone="secondary" style={styles.note}>
          Your teacher can see when you're online and which chapter you have open.
        </AppText>

        <Button label="Log out" variant="text" tone="danger" onPress={onLogout} style={styles.logout} />
      </Screen>

      <BottomNavBar
        active="profile"
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

function Stat({ value, label, icon }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={styles.statValueRow}>
        {icon}
        <AppText variant="display" style={styles.statValue}>
          {value}
        </AppText>
      </View>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

function SettingRow({ label, value, onChange, divider = false }) {
  return (
    <View style={[styles.setting, divider && styles.divider]}>
      <AppText variant="bodyStrong" style={styles.flex}>
        {label}
      </AppText>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: tokens.divider, true: tokens.accent }}
        thumbColor={tokens.surface}
        ios_backgroundColor={tokens.divider}
      />
    </View>
  );
}

const AVATAR = 112;

// The profile photo for now: a fox-head shape (pointed ears, tapered chin)
// in warm sand, with the student's initials on the face.
function FoxAvatar({ name }) {
  return (
    <View style={styles.avatar} accessible accessibilityLabel={`Avatar, ${name}`}>
      <Svg width={AVATAR} height={AVATAR} viewBox="0 0 100 100">
        <Path
          d="M13 11 L37 29 Q50 25 63 29 L87 11 L90 52 Q90 84 50 91 Q10 84 10 52 Z"
          fill={tokens.buttonFace}
          stroke={tokens.buttonFace}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <Path d="M20 22 L31 32 L21 40 Z" fill={tokens.buttonLip} strokeLinejoin="round" />
        <Path d="M80 22 L69 32 L79 40 Z" fill={tokens.buttonLip} strokeLinejoin="round" />
      </Svg>
      <AppText variant="display" style={styles.avatarText}>
        {initials(name)}
      </AppText>
    </View>
  );
}

// The streak flame, filled with the Tail.
function TailFlame() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="profileFlame" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#E8472B" />
          <Stop offset="1" stopColor={tokens.flame} />
        </LinearGradient>
      </Defs>
      <Path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z" fill="url(#profileFlame)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  flex: {
    flex: 1,
  },

  content: {
    paddingTop: space.huge,
  },

  identity: {
    alignItems: "center",
  },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    position: "absolute",
    top: AVATAR * 0.4,
    fontSize: 34,
    lineHeight: 42,
    color: tokens.buttonInk,
  },

  name: {
    marginTop: space.lg,
    textAlign: "center",
  },

  stats: {
    flexDirection: "row",
    marginTop: space.xxxl,
  },

  stat: {
    flex: 1,
    alignItems: "center",
    gap: space.xs,
  },

  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statValue: {
    fontSize: 26,
    lineHeight: 32,
  },

  sectionTitle: {
    marginTop: space.xxxl,
    marginBottom: space.xs,
  },

  setting: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    minHeight: 56,
  },

  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.divider,
  },

  note: {
    marginTop: space.lg,
  },

  logout: {
    marginTop: space.xxl,
  },
});
