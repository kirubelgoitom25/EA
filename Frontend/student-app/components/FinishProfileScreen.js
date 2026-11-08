import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { checkPhone, checkSchool, checkUsername, SCHOOL_MAX, USERNAME_MAX } from "../services/authModel";
import { updateMyProfile } from "../services/api";
import { space } from "../theme";
import { Field } from "./LoginScreen";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import Fox from "./ui/Fox";
import Screen from "./ui/Screen";

// Asked once, of accounts made before phone sign-up: the same three things a new student gives.
// Their name, progress, purchases and email login all stay as they are.
export default function FinishProfileScreen({ user, onDone, onLogout }) {
  const [username, setUsername] = useState(user.username ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [school, setSchool] = useState("");
  const [focused, setFocused] = useState(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const problem = checkUsername(username) || checkPhone(phone) || checkSchool(school);
    if (problem) return setNotice(problem);
    setNotice("");
    setSaving(true);
    try {
      onDone(await updateMyProfile({ username, phone, school }));
    } catch (error) {
      Alert.alert("Couldn't save", error.message);
    } finally {
      setSaving(false);
    }
    return null;
  };

  const fieldProps = { focused, setFocused };
  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button label="Save and continue" onPress={save} disabled={!username || !phone || !school} loading={saving} />
          <Button label="Log out" variant="text" onPress={onLogout} />
        </View>
      }
    >
      <View style={styles.top}>
        <Fox mood="greeting" size={96} />
        <AppText variant="display" style={styles.center}>One more step</AppText>
        <AppText tone="secondary" style={styles.center}>
          Add a username, your phone number and your school. You can then log in with your phone too.
        </AppText>
      </View>
      {notice ? (
        <AppText tone="secondary" style={[styles.center, styles.notice]} accessibilityLiveRegion="polite">
          {notice}
        </AppText>
      ) : null}
      <Field
        {...fieldProps}
        id="username"
        label="Username"
        placeholder="e.g. liya_a"
        value={username}
        onChangeText={setUsername}
        maxLength={USERNAME_MAX}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        {...fieldProps}
        id="phone"
        label="Phone number"
        placeholder="0911 234 567"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Field
        {...fieldProps}
        id="school"
        label="School or university"
        placeholder="e.g. Addis Ababa University"
        value={school}
        onChangeText={setSchool}
        maxLength={SCHOOL_MAX}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center", gap: space.sm, marginTop: space.xl },
  center: { textAlign: "center" },
  notice: { marginTop: space.lg },
  footer: { gap: space.xs },
});
