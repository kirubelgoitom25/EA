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

import { checkEmail, checkPassword, checkSignUp, EMAIL_SIGNUP_OPEN, MAX_NAME } from "../services/authModel";
import { layout, space, tokens, type } from "../theme";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import Fox from "./ui/Fox";

const TITLES = {
  start: ["Welcome to EA", "Your trail is waiting."],
  login: ["Welcome back", "Your trail is waiting."],
  signup: ["Create your account", "Free courses open right away."],
  verify: ["Check your email", "Enter the code we sent you."],
  forgot: ["Forgot your password?", "We'll email you a code."],
  reset: ["Choose a new password", "Enter the code we sent you."],
};

// One text box with its label, so every field looks and behaves the same.
function Field({ id, label, focused, setFocused, inputRef, ...input }) {
  return (
    <>
      <AppText variant="label" tone="secondary" style={styles.label} nativeID={`${id}Label`}>
        {label}
      </AppText>
      <TextInput
        ref={inputRef}
        style={[styles.input, focused === id && styles.inputFocused]}
        placeholderTextColor={tokens.textTertiary}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused(null)}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${id}Label`}
        {...input}
      />
    </>
  );
}

// Getting in, all on one screen: Google first, or a small email form. There's nothing else to fill
// in. Errors are shown by App.js, which owns the calls.
export default function LoginScreen({ onLogin, onGoogle, onSignUp, onVerify, onResend, onForgot, onReset }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState("start");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googling, setGoogling] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [focused, setFocused] = useState(null);
  const passwordRef = useRef(null);
  const emailRef = useRef(null);
  const scrollRef = useRef(null);
  const trimmedEmail = email.trim();

  // While the keyboard is open the fox steps aside so the fields and the button stay visible.
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

  const go = (next, message = "") => {
    setNotice(message);
    setCode("");
    setMode(next);
  };

  const run = async (work) => {
    if (submitting || googling) return;
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      await work();
    } finally {
      setSubmitting(false);
    }
  };

  const google = async () => {
    if (submitting || googling) return;
    setGoogling(true);
    try {
      await onGoogle();
    } finally {
      setGoogling(false);
    }
  };

  const login = () =>
    run(async () => {
      if ((await onLogin({ email, password })) === "verify") {
        await onResend(trimmedEmail);
        go("verify", "Confirm your email first. We've sent you a new code.");
      }
    });

  const signUp = () => {
    const problem = checkSignUp({ name, email, password });
    if (problem) return setNotice(problem);
    return run(async () => {
      const outcome = await onSignUp({ name, email: trimmedEmail, password });
      if (outcome === "verify") go("verify");
      if (outcome === "exists") go("login", "This email already has an account. Log in, or continue with Google if you used it before.");
    });
  };

  const forgot = () => {
    const problem = checkEmail(email);
    if (problem) return setNotice(problem);
    return run(async () => {
      if (await onForgot(trimmedEmail)) go("reset");
    });
  };

  const reset = () => {
    const problem = checkPassword(password);
    if (problem) return setNotice(problem);
    return run(() => onReset({ email: trimmedEmail, code, password }));
  };

  const fieldProps = { focused, setFocused };
  const emailField = (
    <Field
      {...fieldProps}
      id="email"
      label="Email"
      inputRef={emailRef}
      placeholder="you@email.com"
      value={email}
      onChangeText={setEmail}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="emailAddress"
      returnKeyType="next"
      blurOnSubmit={false}
      onSubmitEditing={() => passwordRef.current?.focus()}
    />
  );
  const passwordField = (onSubmit, creating) => (
    <Field
      {...fieldProps}
      id="password"
      label={mode === "reset" ? "New password" : "Password"}
      inputRef={passwordRef}
      placeholder={creating ? "At least 8 characters" : "Your password"}
      value={password}
      onChangeText={setPassword}
      secureTextEntry
      autoComplete={creating ? "new-password" : "password"}
      textContentType={creating ? "newPassword" : "password"}
      returnKeyType="done"
      onSubmitEditing={onSubmit}
    />
  );
  const codeField = (
    <Field
      {...fieldProps}
      id="code"
      label="Code"
      placeholder="123456"
      value={code}
      onChangeText={setCode}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
    />
  );

  const [title, subtitle] = TITLES[mode];
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
        {!keyboardVisible ? <Fox mood="greeting" size={mode === "start" ? 168 : 112} /> : null}

        <AppText variant="display" style={[styles.title, keyboardVisible && styles.titleTight]}>
          {title}
        </AppText>
        {!keyboardVisible ? (
          <AppText tone="secondary" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}

        <View style={styles.form}>
          {notice ? (
            <AppText tone="secondary" style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </AppText>
          ) : null}

          {mode === "start" || mode === "login" || mode === "signup" ? (
            <Button label="Continue with Google" icon="logo-google" onPress={google} loading={googling} disabled={submitting} />
          ) : null}

          {mode === "start" ? (
            <>
              <View style={styles.divider}>
                <View style={styles.line} />
                <AppText variant="caption" tone="secondary">or</AppText>
                <View style={styles.line} />
              </View>
              <Button label="Continue with email" variant="text" onPress={() => go("login")} disabled={googling} />
            </>
          ) : null}

          {mode === "login" ? (
            <>
              {emailField}
              {passwordField(login, false)}
              <Button label="Log in" onPress={login} disabled={!email || !password} loading={submitting} style={styles.button} />
              {EMAIL_SIGNUP_OPEN ? (
                <>
                  <Button label="Forgot password?" variant="text" onPress={() => go("forgot")} style={styles.link} />
                  <Button label="New here? Create an account" variant="text" onPress={() => go("signup")} />
                </>
              ) : (
                <AppText variant="caption" tone="secondary" style={styles.newHere}>
                  New here? Continue with Google to get started.
                </AppText>
              )}
            </>
          ) : null}

          {mode === "signup" ? (
            <>
              <Field
                {...fieldProps}
                id="name"
                label="Name"
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                maxLength={MAX_NAME}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailRef.current?.focus()}
              />
              {emailField}
              {passwordField(signUp, true)}
              <Button label="Create account" onPress={signUp} disabled={!name || !email || !password} loading={submitting} style={styles.button} />
              <Button label="Already have an account? Log in" variant="text" onPress={() => go("login")} style={styles.link} />
            </>
          ) : null}

          {mode === "verify" ? (
            <>
              <AppText tone="secondary" style={styles.sentTo}>{trimmedEmail}</AppText>
              {codeField}
              <Button label="Confirm" onPress={() => run(() => onVerify(trimmedEmail, code))} disabled={!code} loading={submitting} style={styles.button} />
              <Button
                label="Send a new code"
                variant="text"
                onPress={() => run(async () => {
                  await onResend(trimmedEmail);
                  setNotice("A new code is on its way.");
                })}
                style={styles.link}
              />
              <Button label="Back" variant="text" onPress={() => go("signup")} />
            </>
          ) : null}

          {mode === "forgot" ? (
            <>
              {emailField}
              <Button label="Send code" onPress={forgot} disabled={!email} loading={submitting} style={styles.button} />
              <Button label="Back to log in" variant="text" onPress={() => go("login")} style={styles.link} />
            </>
          ) : null}

          {mode === "reset" ? (
            <>
              {codeField}
              {passwordField(reset, true)}
              <Button label="Save and log in" onPress={reset} disabled={!code || !password} loading={submitting} style={styles.button} />
              <Button label="Back to log in" variant="text" onPress={() => go("login")} style={styles.link} />
            </>
          ) : null}
        </View>
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

  link: {
    marginTop: space.sm,
  },

  newHere: {
    marginTop: space.xl,
    textAlign: "center",
  },

  notice: {
    marginBottom: space.lg,
    textAlign: "center",
  },

  sentTo: {
    textAlign: "center",
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginVertical: space.lg,
  },

  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.divider,
  },

});
