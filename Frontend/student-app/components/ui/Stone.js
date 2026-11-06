import React from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { tokens } from "../../theme";
import AppText from "./AppText";

// A stepping stone: one stage of a chapter (or one day of the week).
// - "done": filled with the Tail, dark check
// - "next": white with an ember ring and the number
// - "todo": soft grey with the number
// - "today": dashed outline (week only)
// icon (an Ionicons name) shows in place of the number on "next" and "todo" stones: a video or a
// reading on a chapter's trail.
export default function Stone({ status = "todo", size = 72, label, icon, colors }) {
  const radius = Math.round(size / 3);
  const box = { width: size, height: size, borderRadius: radius, alignItems: "center", justifyContent: "center" };
  const numberStyle = size >= 56 ? "title" : "label";

  if (status === "done") {
    return (
      <LinearGradient colors={colors ?? [tokens.tailStart, tokens.tailEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>
        {size >= 28 ? <Ionicons name="checkmark" size={Math.round(size * 0.42)} color="#FFFFFF" /> : null}
      </LinearGradient>
    );
  }

  if (status === "next") {
    return (
      <View style={[box, { backgroundColor: tokens.surface, borderWidth: size >= 56 ? 4 : 2, borderColor: tokens.accent }]}>
        {icon ? <Ionicons name={icon} size={Math.round(size * 0.4)} color={tokens.accentText} /> : label !== undefined ? <AppText variant={numberStyle} tone="accent">{label}</AppText> : null}
      </View>
    );
  }

  if (status === "today") {
    return <View style={[box, { borderWidth: 2, borderStyle: "dashed", borderColor: "#D9D2DE" }]} />;
  }

  return (
    <View style={[box, { backgroundColor: tokens.neutralTint }]}>
      {icon ? <Ionicons name={icon} size={Math.round(size * 0.4)} color={tokens.textSecondary} /> : label !== undefined ? <AppText variant={numberStyle} tone="secondary">{label}</AppText> : null}
    </View>
  );
}
