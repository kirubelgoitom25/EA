import React, { useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { durationText, money } from "../services/access";
import { MAX_PROOF_BYTES, submitPaymentRequest } from "../services/api";
import { layout, space, tokens } from "../theme";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import Fox from "./ui/Fox";
import Header from "./ui/Header";
import Screen from "./ui/Screen";

// Paying for a course: how to pay, then one screenshot. The price shown is only for reading. What
// the student is charged comes from the server, and the upload carries nothing but the image.
export default function PurchaseScreen({ course, backLabel, onBack, onSent, onRequests }) {
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const use = (result) => {
    const asset = result?.canceled === false ? result.assets?.[0] : null;
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_PROOF_BYTES) {
      Alert.alert("That image is too large", "Please choose one under 5 MB.");
      return;
    }
    setImage(asset);
  };

  // Android can close the app while the photo picker is open. This picks the result back up.
  useEffect(() => {
    ImagePicker.getPendingResultAsync().then(use).catch(() => {});
  }, []);

  const choose = async () => {
    try {
      use(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }));
    } catch (error) {
      Alert.alert("Couldn't open your photos", "Please try again.");
    }
  };

  const send = async () => {
    if (!image || sending) return;
    setSending(true);
    try {
      await submitPaymentRequest(course.id, image);
      setSent(true);
      onSent();
    } catch (error) {
      Alert.alert("Couldn't send your screenshot", error.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Screen
        footer={
          <View style={styles.footer}>
            <Button label="See my payment requests" onPress={onRequests} />
            <Button label="Done" variant="text" onPress={onBack} />
          </View>
        }
      >
        <View style={styles.sent}>
          <Fox mood="greeting" size={140} />
          <AppText variant="title" style={styles.center}>Sent for review</AppText>
          <AppText tone="secondary" style={styles.center}>
            {`Your teacher will check your payment for ${course.title}. The course opens as soon as it's approved.`}
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button label="Send for review" onPress={send} disabled={!image} loading={sending} />
        </View>
      }
    >
      <Header title="Get access" backLabel={backLabel} onBack={onBack} />

      <View style={styles.summary}>
        <AppText variant="bodyStrong" numberOfLines={2}>{course.title}</AppText>
        <AppText variant="title" style={styles.amount}>{money(course.price, course.currency)}</AppText>
        <AppText tone="secondary">{durationText(course.accessDays)}</AppText>
      </View>

      <AppText variant="overline" tone="secondary" style={styles.section}>1. PAY</AppText>
      <AppText selectable>{course.paymentInstructions}</AppText>

      <AppText variant="overline" tone="secondary" style={styles.section}>2. UPLOAD YOUR SCREENSHOT</AppText>
      <Pressable
        onPress={choose}
        accessibilityRole="button"
        accessibilityLabel={image ? "Choose a different screenshot" : "Choose a screenshot"}
        style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
      >
        {image ? (
          <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : (
          <>
            <Ionicons name="image-outline" size={28} color={tokens.accentText} />
            <AppText tone="secondary">Choose a screenshot</AppText>
          </>
        )}
      </Pressable>
      {image ? (
        <Button label="Choose a different one" variant="text" onPress={choose} style={styles.change} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: space.md, padding: space.lg, borderRadius: layout.radius, backgroundColor: tokens.mist },
  amount: { marginTop: space.xs },
  section: { marginTop: space.xl, marginBottom: space.sm },
  picker: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: layout.radius,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: tokens.divider,
  },
  pressed: { opacity: 0.7 },
  preview: { width: "100%", height: "100%" },
  change: { marginTop: space.xs, alignSelf: "center" },
  footer: { gap: space.xs },
  sent: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, paddingTop: space.xxxl },
  center: { textAlign: "center" },
});
