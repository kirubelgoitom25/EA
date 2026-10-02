import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { haptic } from "../services/feedback";
import { radius, useTheme } from "../theme";

const TABS = [
  { key: "home", label: "Home", icon: "home" },
  { key: "courses", label: "Courses", icon: "book" },
  { key: "ranking", label: "Ranking", icon: "trophy" },
  { key: "profile", label: "Profile", icon: "person" },
];

export default function BottomNavBar({ active, onNavigate }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrapper}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => {
              haptic.light();
              onNavigate(tab.key);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.iconWrap, isActive && styles.activeIconWrap]}>
              <Ionicons
                name={isActive ? tab.icon : `${tab.icon}-outline`}
                size={22}
                color={isActive ? colors.orange : colors.textSecondary}
              />
            </View>

            <Text style={[styles.label, isActive && styles.activeLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    flexDirection: "row",
    backgroundColor: colors.orangeLight,
    borderRadius: radius.xl,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 22 : 10,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: colors.orangeSoft,
    shadowColor: colors.orange,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },

  iconWrap: {
    width: 48,
    height: 32,
    borderRadius: radius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },

  activeIconWrap: {
    backgroundColor: "#fff",
    borderBottomWidth: 3,
    borderBottomColor: colors.orangeDeep,
  },

  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },

  activeLabel: {
    color: colors.orangeDeep,
    fontWeight: "800",
  },
});