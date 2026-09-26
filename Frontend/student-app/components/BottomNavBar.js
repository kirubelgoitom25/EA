import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

const TABS = [
  { key: "home", label: "Home", icon: "home", color: colors.green },
  { key: "courses", label: "Courses", icon: "book", color: colors.blue },
  { key: "ranking", label: "Ranking", icon: "trophy", color: colors.gold },
  { key: "profile", label: "Profile", icon: "person", color: colors.purple },
];

export default function BottomNavBar({ active, onNavigate }) {
  return (
    <View style={styles.wrapper}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onNavigate(tab.key)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconWrap,
                isActive && { backgroundColor: `${tab.color}22` },
              ]}
            >
              <Ionicons
                name={isActive ? tab.icon : `${tab.icon}-outline`}
                size={22}
                color={isActive ? tab.color : "#b0b6c0"}
              />
            </View>

            <Text
              style={[
                styles.label,
                isActive && { color: tab.color, fontWeight: "800" },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
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
    backgroundColor: "#fff",
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 26 : 14,
    borderTopWidth: 2,
    borderTopColor: "#f0f0f0",
  },

  tab: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },

  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b0b6c0",
  },
});
