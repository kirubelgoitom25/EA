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

  const canSubmit = email.length > 0 && password.length > 0;

  const handleLogin = () => {
    if (canSubmit) {
      onLogin({
        name: "Student",
        email: email,
        role: "student",
      });
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
        {/* Chunky Duolingo 3D Mascot Header with EA Text */}
        <View style={styles.mascotWrap}>
          <View style={styles.mascotCircle}>
            <Text style={styles.eaLogoText}>EA</Text>
          </View>
          <View style={[styles.floatingDot, styles.dotGold]} />
          <View style={[styles.floatingDot, styles.dotBlue]} />
        </View>

        <Text style={styles.title}>Welcome back!</Text>
        <Text style={styles.subtitle}>Log in to continue your streak</Text>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <View style={styles.inputWrap}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={colors.textMuted || "#AFAFAF"}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="student@example.com"
              placeholderTextColor="#AFAFAF"
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
              size={20}
              color={colors.textMuted || "#AFAFAF"}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#AFAFAF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {/* Chunky Duolingo 3D Button */}
          <DuoButton
            label="LOG IN"
            variant="primary"
            disabled={!canSubmit}
            onPress={handleLogin}
            style={styles.loginButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg || "#FFFFFF",
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
  },

  mascotWrap: {
    alignSelf: "center",
    marginBottom: 20,
    position: "relative",
  },

  mascotCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.green || "#58CC02",
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 6,
    borderBottomColor: colors.greenDark || "#46A302",
  },

  eaLogoText: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -1,
  },

  floatingDot: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  dotGold: {
    backgroundColor: colors.gold || "#FFC800",
    top: 0,
    right: -4,
  },

  dotBlue: {
    backgroundColor: colors.blue || "#1CB0F6",
    bottom: 2,
    left: -6,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    color: colors.text || "#4B4B4B",
  },

  subtitle: {
    fontSize: 16,
    color: colors.textMuted || "#777777",
    textAlign: "center",
    marginBottom: 32,
    fontWeight: "600",
  },

  form: {
    width: "100%",
  },

  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted || "#777777",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    backgroundColor: "#F7F7F7",
    borderWidth: 2,
    borderColor: colors.border || "#E5E5E5",
    borderRadius: radius?.md || 16,
    paddingHorizontal: 16,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text || "#4B4B4B",
    fontWeight: "700",
    height: "100%",
  },

  loginButton: {
    marginTop: 28,
  },
});