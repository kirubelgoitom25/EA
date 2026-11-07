import * as WebBrowser from "expo-web-browser";

import { supabase } from "../lib/supabase";
import { ACCOUNT_OFF_TEXT, loadStudentUser } from "./api";
import { AUTH_REDIRECT, callbackLog, googleError, readCallback } from "./authModel";

// Continue with Google: Supabase builds the address, a secure browser sheet opens it, and Google
// sends the student back to the app with a one-time code. The code is useless without the secret
// this phone kept (PKCE), so it doesn't matter if another app sees it.

// A code works once, and on Android the app can hear about it twice.
const finishing = new Map();
let inProgress = false;

export const googleSignInInProgress = () => inProgress;

export function finishGoogleSignIn(url) {
  console.log("[google-auth] callback", JSON.stringify(callbackLog(url)));
  const result = readCallback(url);
  if (!result.code) {
    const failure = googleError(result);
    return Promise.reject(new Error(failure.banned ? ACCOUNT_OFF_TEXT : failure.message));
  }
  if (!finishing.has(result.code)) {
    finishing.set(result.code, exchange(result.code));
  }
  return finishing.get(result.code);
}

async function exchange(code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.log("[google-auth] code exchange failed", error.name, error.code ?? "", error.message);
    throw new Error("Couldn't sign in with Google. Please try again.");
  }
  return loadStudentUser();
}

// The student, or null if they closed the sheet.
export async function signInWithGoogle() {
  inProgress = true;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: AUTH_REDIRECT,
        skipBrowserRedirect: true, // this app opens the sheet itself
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data?.url) {
      throw new Error("Can't reach the server. Check your connection and try again.");
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
    console.log("[google-auth] browser closed", result.type);
    if (result.type !== "success") {
      return null;
    }
    return await finishGoogleSignIn(result.url);
  } finally {
    inProgress = false;
  }
}
