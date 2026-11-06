import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as aesjs from "aes-js";
import { CryptoDigestAlgorithm, digest } from "expo-crypto";
import { createClient } from "@supabase/supabase-js";

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config";

// A Supabase session is bigger than what SecureStore (the phone's
// encrypted keychain) can hold. So: the session itself is encrypted with
// a random AES key and stored in AsyncStorage, and only that small key
// goes in the keychain. Someone reading the app's storage sees ciphertext.
class LargeSecureStore {
  async _encrypt(key, value) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  async _decrypt(key, value) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) {
      return encryptionKeyHex;
    }
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1)
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) {
      return encrypted;
    }
    return await this._decrypt(key, encrypted);
  }

  async setItem(key, value) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

// Google sign-in proves this phone asked for the code by hashing a secret. React Native has no
// built-in hash here, and supabase-js would quietly fall back to sending the secret unhashed.
if (globalThis.crypto && !globalThis.crypto.subtle) {
  globalThis.crypto.subtle = {
    digest: (algorithm, data) => digest(CryptoDigestAlgorithm.SHA256, data),
  };
}

// A test Supabase project, for trying sign-up without touching the live one. Unset means live.
const authUrl = process.env.EXPO_PUBLIC_TEST_SUPABASE_URL || SUPABASE_URL;
const authKey = process.env.EXPO_PUBLIC_TEST_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

export const supabase = createClient(authUrl, authKey, {
  auth: {
    flowType: "pkce",
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh the login token while the app is on screen.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});