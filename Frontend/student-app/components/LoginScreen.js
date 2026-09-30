import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { radius, useTheme } from "../theme";
import DuoButton from "./DuoButton";

export default function LoginScreen({ onLogin }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const passwordRef = useRef(null);
  const scrollRef = useRef(null);

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  // Track the keyboard so the layout can shrink while it is open.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      // Give the layout a moment to resize, then scroll to the bottom
      // so the button and both fields stay visible.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (!canSubmit) {
      return;
    }

    Keyboard.dismiss();
    setSubmitting(true);
    try {
      await onLogin({ email, password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          keyboardVisible && styles.contentKeyboard,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <View
            style={[
              styles.brandBadge,
              keyboardVisible && styles.brandBadgeSmall,
            ]}
          >
            <Text
              style={[
                styles.brandBadgeText,
                keyboardVisible && styles.brandBadgeTextSmall,
              ]}
            >
              EA
            </Text>
          </View>

          {/* Mascot is hidden while typing to free up space */}
          {!keyboardVisible && (
            <View style={styles.mascotCard}>
              <View style={styles.mascotBody}>
                <Ionicons name="school" size={42} color="#fff" />
              </View>
              <View style={[styles.floatDot, styles.dotOrange]} />
              <View style={[styles.floatDot, styles.dotYellow]} />
              <View style={[styles.floatDot, styles.dotBlue]} />
            </View>
          )}
        </View>

        <Text style={[styles.title, keyboardVisible && styles.titleSmall]}>
          KEEP YOUR STREAK GOING
        </Text>
        {!keyboardVisible && (
          <Text style={styles.subtitle}>
            Welcome back! Ready for another small win?
          </Text>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
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
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={colors.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <DuoButton
            label="Log In"
            variant="primary"
            disabled={!canSubmit}
            onPress={handleLogin}
            style={styles.loginButton}
            icon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
          />
        </View>

        {!keyboardVisible && (
          <Text style={styles.footerText}>
            New here? Your account is created automatically for now.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingTop: 50,
    paddingBottom: 40,
  },

  // When the keyboard is open, start from the top and leave room below
  contentKeyboard: {
    justifyContent: "flex-start",
    paddingTop: 30,
    paddingBottom: 24,
  },

  heroWrap: {
    alignItems: "center",
    marginBottom: 18,
  },

  brandBadge: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: colors.orange,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#F5C8AF",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },

  brandBadgeSmall: {
    width: 52,
    height: 52,
    borderRadius: 16,
    marginBottom: 0,
  },

  brandBadgeText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -1,
  },

  brandBadgeTextSmall: {
    fontSize: 20,
  },

  mascotCard: {
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  mascotBody: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.orange,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 6,
    borderBottomColor: colors.orangeDeep,
  },

  floatDot: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  dotOrange: {
    backgroundColor: colors.orange,
    top: 10,
    right: 18,
  },

  dotYellow: {
    backgroundColor: colors.yellow,
    bottom: 18,
    left: 20,
  },

  dotBlue: {
    backgroundColor: colors.blue,
    top: 26,
    left: 6,
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    color: colors.text,
    letterSpacing: -0.8,
    marginBottom: 8,
  },

  titleSmall: {
    fontSize: 22,
    marginBottom: 12,
  },

  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 28,
    fontWeight: "600",
  },

  form: {
    width: "100%",
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 12,
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    marginBottom: 6,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    height: "100%",
  },

  loginButton: {
    marginTop: 26,
  },

  footerText: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 20,
  },
});