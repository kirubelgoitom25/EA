import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";
import { haptic } from "../services/feedback";
import { tokens } from "../theme";
import { NAV_BAR_HEIGHT } from "./ui/Screen";

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
    <View style={[styles.wrapper, { height: NAV_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]} accessibilityRole="tablist">
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
                size={26}
                color={isActive ? tokens.accentLip : tokens.text}
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
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: tokens.surface,
    paddingHorizontal: 16,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.divider,
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
    width: 72,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  capsuleActive: {
    backgroundColor: tokens.accentTint,
  },
});
