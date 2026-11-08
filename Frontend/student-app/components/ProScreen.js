import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { isProActive, money, planDurationText, proButtonLabel, proLine } from "../services/access";
import { fetchPlans } from "../services/api";
import { layout, space, tokens } from "../theme";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import Header from "./ui/Header";
import Screen from "./ui/Screen";
import { RowsSkeleton } from "./ui/Skeleton";

// EA Pro: where the student stands, what Pro gives, and the plans to choose from. Paying goes
// through the same screenshot flow as a course (PurchaseScreen with a plan).
export default function ProScreen({ pro, proCourseCount = 0, backLabel, onBack, onChoose, onRequests }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    fetchPlans()
      .then((list) => {
        if (!live) return;
        setPlans(list);
        setChosen((current) => current ?? list[0]?.id ?? null);
      })
      // The server's own words ("Not Found") mean nothing to a student.
      .catch(() => live && setError("Couldn't load the plans. Check your connection and try again."));
    return () => {
      live = false;
    };
  }, [attempt]);

  const active = isProActive(pro);
  const plan = (plans ?? []).find((p) => p.id === chosen);

  return (
    <Screen
      footer={
        plans?.length ? (
          <View style={styles.footer}>
            <Button label={proButtonLabel(pro)} onPress={() => plan && onChoose(plan)} disabled={!plan} icon="sparkles-outline" />
            {active ? (
              <AppText variant="caption" tone="secondary" style={styles.center}>
                Renewing adds time after your current end date.
              </AppText>
            ) : null}
          </View>
        ) : null
      }
    >
      <Header title="EA Pro" backLabel={backLabel} onBack={onBack} />

      <View style={[styles.status, active && styles.statusActive]}>
        <ProBadge />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{active ? "You're a Pro member" : "EA Pro"}</AppText>
          <AppText tone="secondary">{proLine(pro)}</AppText>
        </View>
      </View>

      <AppText variant="overline" tone="secondary" style={styles.section}>WHAT YOU GET</AppText>
      <Perk icon="book-outline">
        {proCourseCount > 0
          ? `Every Pro course${proCourseCount > 1 ? `, ${proCourseCount} right now` : ""}`
          : "Every Pro course, as teachers add them"}
      </Perk>
      <Perk icon="ribbon-outline">A Pro badge beside your name on the rankings</Perk>
      <Perk icon="shield-checkmark-outline">Courses you bought stay yours, with or without Pro</Perk>

      <AppText variant="overline" tone="secondary" style={styles.section}>CHOOSE A PLAN</AppText>
      {error ? (
        <>
          <AppText tone="secondary">{error}</AppText>
          <Button label="Try again" variant="text" onPress={() => setAttempt((n) => n + 1)} style={styles.retry} />
        </>
      ) : null}
      {!plans && !error ? <RowsSkeleton count={2} /> : null}
      {plans?.length === 0 ? <AppText tone="secondary">EA Pro isn't on sale yet. Check back soon.</AppText> : null}
      {(plans ?? []).map((p) => {
        const selected = p.id === chosen;
        return (
          <Pressable
            key={p.id}
            onPress={() => setChosen(p.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${p.title}, ${money(p.price, p.currency)}, ${planDurationText(p.accessDays)}`}
            style={({ pressed }) => [styles.plan, selected && styles.planSelected, pressed && styles.pressed]}
          >
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{p.title}</AppText>
              <AppText tone="secondary">{planDurationText(p.accessDays)}</AppText>
            </View>
            <AppText variant="bodyStrong">{money(p.price, p.currency)}</AppText>
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={22}
              color={selected ? tokens.accent : tokens.textTertiary}
            />
          </Pressable>
        );
      })}

      <Button label="See my payment requests" variant="text" onPress={onRequests} style={styles.link} />
    </Screen>
  );
}

function Perk({ icon, children }) {
  return (
    <View style={styles.perk}>
      <Ionicons name={icon} size={20} color={tokens.accentText} />
      <AppText style={styles.flex}>{children}</AppText>
    </View>
  );
}

// The small mark used wherever Pro shows: this screen, the profile, the rankings.
export function ProBadge({ small = false }) {
  return (
    <View style={[styles.badge, small && styles.badgeSmall]} accessibilityLabel="Pro">
      <AppText variant="caption" style={[styles.badgeText, small && styles.badgeTextSmall]}>PRO</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  footer: { gap: space.xs },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
    padding: space.lg,
    borderRadius: layout.radius,
    backgroundColor: tokens.mist,
  },
  statusActive: { borderWidth: 1.5, borderColor: tokens.accent },
  section: { marginTop: space.xl, marginBottom: space.sm },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  plan: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    marginBottom: space.sm,
    borderRadius: layout.radius,
    borderWidth: 1.5,
    borderColor: tokens.divider,
  },
  planSelected: { borderColor: tokens.accent, borderWidth: 2 },
  pressed: { opacity: 0.7 },
  link: { marginTop: space.md, alignSelf: "center" },
  retry: { alignSelf: "flex-start" },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: 8,
    // The dark sage: white text on it reads clearly (about 6:1), unlike on the lighter accent.
    backgroundColor: tokens.accentText,
  },
  badgeSmall: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  badgeText: { color: tokens.onAccent, fontWeight: "800", letterSpacing: 1 },
  badgeTextSmall: { fontSize: 10, lineHeight: 14 },
});
