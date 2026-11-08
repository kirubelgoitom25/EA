import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { buyLabel, dateText, durationText, includedWithPro, isProCourse, money, proButtonLabel } from "../services/access";
import { ProBadge } from "./ProScreen";
import { layout, space, tokens } from "../theme";
import { flattenChapters } from "./session/sessionModel";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import Emblem from "./ui/Emblem";
import Header from "./ui/Header";
import Screen from "./ui/Screen";

// A paid course the student can't open yet: what it is, what it costs, how long it lasts, and what's
// inside. The chapter titles sell it. The content itself never reaches the phone until it's open.
// A Pro course offers EA Pro instead of a price.
export default function LockedCourseScreen({ course, pro, backLabel, onBack, onBuy, onPro, onRequests }) {
  const chapters = flattenChapters(course);
  const access = course.access ?? {};
  const waiting = access.pendingRequests > 0;
  const onSale = course.purchasable !== false;
  const proCourse = isProCourse(course);
  // Paid, and also included in EA Pro: two ways in.
  const alsoPro = !proCourse && includedWithPro(course);

  return (
    <Screen
      footer={
        proCourse ? (
          <View style={styles.footer}>
            <Button label={proButtonLabel(pro)} onPress={onPro} icon="sparkles-outline" />
          </View>
        ) : (
        <View style={styles.footer}>
          {!onSale ? (
            <AppText variant="caption" tone="secondary" style={styles.waiting}>
              This course isn't available to buy right now.
            </AppText>
          ) : waiting ? (
            <AppText variant="caption" tone="secondary" style={styles.waiting}>
              Your payment is being reviewed. You can send another if you need to.
            </AppText>
          ) : null}
          {onSale ? <Button label={buyLabel(course)} onPress={onBuy} icon="lock-open-outline" /> : null}
          {alsoPro ? <Button label={pro && pro.state !== "none" ? "Or renew EA Pro" : "Or get EA Pro"} variant="text" onPress={onPro} /> : null}
        </View>
        )
      }
    >
      <Header title={course.title} backLabel={backLabel} onBack={onBack} />

      <View style={styles.top}>
        <Emblem course={course} size={56} radius={17} />
        {proCourse ? (
          <View style={styles.price}>
            <View style={styles.proRow}>
              <ProBadge />
              <AppText variant="title">EA Pro</AppText>
            </View>
            <AppText tone="secondary">Included with EA Pro</AppText>
          </View>
        ) : (
          <View style={styles.price}>
            <AppText variant="title">{money(course.price, course.currency)}</AppText>
            <AppText tone="secondary">{durationText(course.accessDays)}</AppText>
            {alsoPro ? (
              <View style={[styles.proRow, styles.alsoPro]}>
                <ProBadge small />
                <AppText variant="caption" tone="secondary">Included with EA Pro</AppText>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {proCourse && pro?.state === "expired" ? (
        <Note icon="time-outline">
          Your Pro ended{pro.expiresAt ? ` on ${dateText(pro.expiresAt)}` : ""}. Your progress is safe. Renew Pro to pick up where you left off.
        </Note>
      ) : null}
      {proCourse && pro?.state === "revoked" ? (
        <Note icon="alert-circle-outline">Your Pro was removed. Your progress is safe.</Note>
      ) : null}

      {access.state === "expired" ? (
        <Note icon="time-outline">
          Your access ended{access.expiresAt ? ` on ${dateText(access.expiresAt)}` : ""}. Your progress is safe. Renew to pick up where you left off.
        </Note>
      ) : null}
      {access.state === "revoked" ? (
        <Note icon="alert-circle-outline">Your access to this course was removed. Your progress is safe.</Note>
      ) : null}

      <AppText style={styles.description}>{course.description}</AppText>

      {waiting ? (
        <Button label="See my payment requests" variant="text" onPress={onRequests} style={styles.link} />
      ) : null}

      <AppText variant="overline" tone="secondary" style={styles.section}>
        {`${chapters.length} ${chapters.length === 1 ? "CHAPTER" : "CHAPTERS"}`}
      </AppText>
      {chapters.map((chapter, index) => (
        <View key={chapter.id} style={styles.chapter}>
          <Ionicons name="lock-closed" size={14} color={tokens.textTertiary} />
          <AppText tone="secondary" numberOfLines={2} style={styles.chapterTitle}>
            {`${index + 1}. ${chapter.title}`}
          </AppText>
        </View>
      ))}
    </Screen>
  );
}

function Note({ icon, children }) {
  return (
    <View style={styles.note}>
      <Ionicons name={icon} size={18} color={tokens.accentText} />
      <AppText style={styles.noteText}>{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: space.md },
  price: { flex: 1 },
  proRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  alsoPro: { marginTop: space.xs },
  description: { marginTop: space.lg },
  link: { marginTop: space.sm, alignSelf: "flex-start" },
  section: { marginTop: space.xl, marginBottom: space.sm },
  chapter: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  chapterTitle: { flex: 1 },
  note: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: layout.radius,
    backgroundColor: tokens.mist,
  },
  noteText: { flex: 1 },
  footer: { gap: space.sm },
  waiting: { textAlign: "center" },
});
