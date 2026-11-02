import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { haptic } from "../services/feedback";
import { layout, tokens } from "../theme";
import { NAV_BAR_HEIGHT, NAV_BAR_MARGIN } from "./ui/Screen";

// One icon family: outline when idle, filled when you're on it.
const ICONS = {
  home: ["home-outline", "home"],
  courses: ["book-outline", "book"],
  ranking: ["trophy-outline", "trophy"],
  profile: ["person-outline", "person"],
};

// The labels are for screen readers only — the bar itself is icons.
const TABS = [
  { key: "home", label: "Home" },
  { key: "courses", label: "Courses" },
  { key: "ranking", label: "Leaderboard" },
  { key: "profile", label: "Profile" },
];

// The bottom tab bar on every main screen: a floating white pill, icons only. The
// active tab is a filled ember icon in a soft capsule.
export default function BottomNavBar({ active, onNavigate }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + NAV_BAR_MARGIN }]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const [outline, filled] = ICONS[tab.key];

        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            onPress={() => {
              haptic.light();
              onNavigate(tab.key);
            }}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <View style={[styles.capsule, isActive && styles.capsuleActive]}>
              <Ionicons
                name={isActive ? filled : outline}
                size={24}
                color={isActive ? tokens.accent : tokens.textSecondary}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: layout.gutter,
    right: layout.gutter,
    flexDirection: "row",
    backgroundColor: tokens.surface,
    borderRadius: NAV_BAR_HEIGHT / 2,
    paddingHorizontal: 8,
    shadowColor: tokens.plum,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  tab: {
    flex: 1,
    height: NAV_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },

  pressed: {
    opacity: 0.6,
  },

  capsule: {
    width: 60,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  capsuleActive: {
    backgroundColor: tokens.accentTint,
  },
});
