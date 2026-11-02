import React, { useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout, space, tokens, type } from "../theme";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import Fox from "./ui/Fox";

// Log in: the fox says hello, two fields, one button. Errors are shown by
// App.js (it owns the login call).
export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [focused, setFocused] = useState(null);
  const passwordRef = useRef(null);
  const scrollRef = useRef(null);

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  // While the keyboard is open the fox steps aside so both fields and the
  // button stay visible.
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      await onLogin({ email, password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + (keyboardVisible ? space.xl : space.xxxl), paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        {!keyboardVisible ? <Fox mood="greeting" size={168} /> : null}

        <AppText variant="display" style={[styles.title, keyboardVisible && styles.titleTight]}>
          Welcome back
        </AppText>
        {!keyboardVisible ? (
          <AppText tone="secondary" style={styles.subtitle}>
            Your trail is waiting.
          </AppText>
        ) : null}

        <View style={styles.form}>
          <AppText variant="label" tone="secondary" style={styles.label} nativeID="emailLabel">
            Email
          </AppText>
          <TextInput
            style={[styles.input, focused === "email" && styles.inputFocused]}
            placeholder="you@school.com"
            placeholderTextColor={tokens.textTertiary}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="Email"
            accessibilityLabelledBy="emailLabel"
          />

          <AppText variant="label" tone="secondary" style={styles.label} nativeID="passwordLabel">
            Password
          </AppText>
          <TextInput
            ref={passwordRef}
            style={[styles.input, focused === "password" && styles.inputFocused]}
            placeholder="Your password"
            placeholderTextColor={tokens.textTertiary}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            accessibilityLabel="Password"
            accessibilityLabelledBy="passwordLabel"
          />

          <Button
            label="Log in"
            onPress={handleLogin}
            disabled={!email || !password}
            loading={submitting}
            style={styles.button}
          />
        </View>

        <AppText variant="caption" tone="secondary" style={styles.footer}>
          New here? Ask your school administrator to create an account for you.
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bg,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: layout.gutter,
  },

  title: {
    marginTop: space.xl,
    textAlign: "center",
  },

  titleTight: {
    marginTop: 0,
  },

  subtitle: {
    marginTop: space.xs,
    textAlign: "center",
  },

  form: {
    marginTop: space.xxl,
  },

  label: {
    marginBottom: space.sm,
    marginTop: space.lg,
  },

  input: {
    ...type.body,
    color: tokens.text,
    height: 56,
    paddingHorizontal: space.lg,
    borderRadius: layout.radius,
    borderWidth: 1.5,
    borderColor: tokens.divider,
    backgroundColor: tokens.surface,
  },

  inputFocused: {
    borderColor: tokens.accent,
    borderWidth: 2,
  },

  button: {
    marginTop: space.xxl,
  },

  footer: {
    marginTop: space.xl,
    textAlign: "center",
  },
});
