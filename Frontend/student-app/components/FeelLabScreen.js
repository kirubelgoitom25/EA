import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { MOMENTS } from "../services/hapticPatterns";
import { playFeeling, stopFeeling } from "../services/hapticRunner";
import { space, tokens, ui } from "../theme";
import AppText from "./ui/AppText";
import Header from "./ui/Header";
import Screen from "./ui/Screen";

import { feedback } from "../services/feedback";

const PICKS_KEY = "ea.feellab.picks.v1";

// Sounds sit beside the haptics: a candidate with `sound` plays that file; one with `sequence`
// plays several, each after its delay in ms.
const SOUND_MOMENTS = [
  {
    id: "correct-sound",
    title: "Correct answer sound",
    where: "The sound after Check when the answer is right. Needs Sound effects on",
    variants: [
      { id: "a", name: "Two-note chime, F# then A# (now in the app)", sound: "correct" },
      { id: "b", name: "Bubble pop (the previous pick)", sound: "correctBubble" },
      { id: "c", name: "Original sound", sound: "correctOld" },
    ],
  },
  {
    id: "stat-sounds",
    title: "Result card sounds",
    where: "Score, Stages and Best streak popping in after a stage. Each one higher than the last",
    variants: [
      { id: "a", name: "Score pop (lowest, longest tail)", sound: "stat1" },
      { id: "b", name: "Stages pop (middle, short)", sound: "stat2" },
      { id: "c", name: "Best streak pop (highest, shortest)", sound: "stat3" },
      { id: "d", name: "All three, as on the stage screen", sequence: [["stat1", 300], ["stat2", 600], ["stat3", 900]] },
    ],
  },
];
const soundTimers = [];
const playSounds = (variant) => {
  soundTimers.splice(0).forEach(clearTimeout);
  if (variant.sound) return feedback.sample(variant.sound);
  variant.sequence.forEach(([name, at]) => soundTimers.push(setTimeout(() => feedback.sample(name), at)));
};
const LAB = [...MOMENTS, ...SOUND_MOMENTS];

// A workbench for how the app should feel. Every moment of the app is a card with three candidate
// feelings: tap a row to feel it, tap its star to make it your pick. The picks are saved on the
// phone and summed up at the bottom so they can be read out and wired into the app.
export default function FeelLabScreen({ backLabel, onBack }) {
  const [picks, setPicks] = useState({});

  useEffect(() => {
    AsyncStorage.getItem(PICKS_KEY)
      .then((raw) => raw && setPicks(JSON.parse(raw)))
      .catch(() => {});
    return () => {
      stopFeeling();
      soundTimers.splice(0).forEach(clearTimeout);
    };
  }, []);

  const pick = (momentId, variantId) => {
    setPicks((current) => {
      const next = { ...current };
      if (next[momentId] === variantId) delete next[momentId];
      else next[momentId] = variantId;
      AsyncStorage.setItem(PICKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const summary = LAB.map((moment) => {
    const chosen = moment.variants.find((variant) => variant.id === picks[moment.id]);
    return `${moment.title}: ${chosen ? `${chosen.id.toUpperCase()} ${chosen.name}` : "not picked"}`;
  });

  return (
    <Screen>
      <Header
        title="Feel lab"
        subtitle="Tap a row to feel it. Star the one you like best for each moment."
        backLabel={backLabel}
        onBack={onBack}
      />

      {LAB.map((moment) => (
        <View key={moment.id} style={styles.card}>
          <AppText variant="title" style={styles.title}>{moment.title}</AppText>
          <AppText variant="caption" tone="secondary" style={styles.where}>{moment.where}</AppText>
          {moment.variants.map((variant) => {
            const picked = picks[moment.id] === variant.id;
            return (
              <View key={variant.id} style={[styles.row, picked && styles.rowPicked]}>
                <Pressable
                  onPress={() => (variant.steps ? playFeeling(variant) : playSounds(variant))}
                  accessibilityRole="button"
                  accessibilityLabel={`Feel ${moment.title}, option ${variant.id}, ${variant.name}`}
                  style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
                >
                  <View style={styles.letter}>
                    <AppText style={styles.letterText}>{variant.id.toUpperCase()}</AppText>
                  </View>
                  <AppText style={styles.name}>{variant.name}</AppText>
                  <Ionicons name="radio-outline" size={20} color={ui.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => pick(moment.id, variant.id)}
                  hitSlop={space.sm}
                  accessibilityRole="button"
                  accessibilityLabel={picked ? "Remove pick" : "Pick this one"}
                  style={styles.star}
                >
                  <Ionicons name={picked ? "star" : "star-outline"} size={24} color={picked ? ui.primary : ui.textMuted} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.card}>
        <AppText variant="title" style={styles.title}>Your picks</AppText>
        {summary.map((line) => (
          <AppText key={line} variant="caption" tone="secondary" selectable style={styles.summaryLine}>{line}</AppText>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ui.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E3EAE5",
    padding: space.lg,
    marginBottom: space.lg,
  },
  title: { color: tokens.text },
  where: { marginTop: space.xs, marginBottom: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
    marginTop: space.xs,
  },
  rowPicked: { backgroundColor: ui.selected.face, borderColor: ui.selected.edge },
  play: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm },
  playPressed: { backgroundColor: ui.screen },
  letter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ui.done.face,
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: { color: ui.done.ink, fontWeight: "800", fontSize: 13 },
  name: { flex: 1, color: tokens.text },
  star: { paddingHorizontal: space.md, paddingVertical: space.md },
  summaryLine: { marginTop: space.xs },
});
