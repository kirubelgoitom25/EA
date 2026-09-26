import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius } from "../theme";
import DuoButton from "./DuoButton";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  const handleLogin = async () => {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      // App.js owns the actual login call (via services/api.js) so
      // this screen doesn't need to know whether it's talking to
      // mock data or a real backend.
      await onLogin({ email, password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mascotWrap}>
          <View style={styles.mascotCircle}>
            <Ionicons name="school" size={40} color="#fff" />
          </View>

          <View style={[styles.floatingDot, styles.dotGold]} />
          <View style={[styles.floatingDot, styles.dotBlue]} />
        </View>

        <Text style={styles.title}>Welcome back!</Text>
        <Text style={styles.subtitle}>Log in to keep your streak alive 🔥</Text>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL</Text>

          <View style={styles.inputWrap}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={colors.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.label}>PASSWORD</Text>

          <View style={styles.inputWrap}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={colors.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#aaa"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <DuoButton
            label="Log In"
            variant="primary"
            disabled={!canSubmit}
            onPress={handleLogin}
            style={styles.loginButton}
          />
        </View>

        <Text style={styles.footerText}>
          New here? Your account is created automatically for now.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 60,
  },

  mascotWrap: {
    alignSelf: "center",
    marginBottom: 24,
  },

  mascotCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.green,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 6,
    borderBottomColor: colors.greenDark,
  },

  floatingDot: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
  },

  dotGold: {
    backgroundColor: colors.gold,
    top: -4,
    right: -8,
  },

  dotBlue: {
    backgroundColor: colors.blue,
    bottom: -2,
    left: -10,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    color: colors.text,
  },

  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 36,
    fontWeight: "600",
  },

  form: {
    width: "100%",
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 18,
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },

  inputIcon: {
    marginRight: 8,
  },

  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    height: "100%",
  },

  loginButton: {
    marginTop: 30,
  },

  footerText: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 24,
  },
});
