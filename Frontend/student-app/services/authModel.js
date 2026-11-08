// Sign-up and sign-in rules as plain functions (no React, no network), so they're easy to test.

export const AUTH_SCHEME = "ea-student";
export const AUTH_REDIRECT = `${AUTH_SCHEME}://auth-callback`;

// Google is how new students join. Creating an account by email and resetting a password both
// need an email provider to deliver codes, so they stay hidden until one is set up. Existing
// students can always log in with their password. Turn this on when email works.
export const EMAIL_SIGNUP_OPEN = false;

// Google sign-in is paused (Supabase can't exchange Google's code yet). The code stays; this hides
// the button. Students join with a username, phone, password and school instead.
export const GOOGLE_SIGNIN_OPEN = false;

export const MIN_PASSWORD = 8;
export const MAX_NAME = 60;

export const isAuthCallback = (url) => typeof url === "string" && url.startsWith(AUTH_REDIRECT);

// What came back from the browser: { code } or { error }. Supabase can put either in the query
// string or after the #.
export function readCallback(url) {
  const params = {};
  const at = url.indexOf("?") >= 0 ? url.indexOf("?") : url.indexOf("#");
  if (at < 0) return params;
  for (const pair of url.slice(at + 1).split(/[?#&]/)) {
    const split = pair.indexOf("=");
    if (split > 0) {
      params[pair.slice(0, split)] = decodeURIComponent(pair.slice(split + 1).replace(/\+/g, " "));
    }
  }
  return {
    code: params.code ?? null,
    error: params.error_description ?? params.error ?? null,
    errorCode: params.error_code ?? null,
  };
}

// What's safe to log about a callback. Never the code: it's a secret, and Supabase can quote
// Google's code inside its error message.
export function callbackLog(url) {
  const { code, error, errorCode } = readCallback(url);
  return {
    hasCode: Boolean(code),
    errorCode: errorCode ?? null,
    error: error?.replace(/4\/[\w-]+/g, "4/<hidden>") ?? null,
  };
}

// A failed Google sign-in, in words. banned is the account-off case, shown the usual way.
export function googleError({ error, errorCode }) {
  const text = `${error ?? ""} ${errorCode ?? ""}`.toLowerCase();
  if (text.includes("banned")) return { banned: true };
  if (text.includes("signup") || text.includes("signups")) {
    return { message: "New accounts aren't open yet. Please try again soon." };
  }
  return { message: "Couldn't sign in with Google. Please try again." };
}

// What signUp's answer means. With email confirmation on there's no session yet, and Supabase
// hides whether an address is taken by returning a user with no identities.
export function signUpOutcome(data) {
  if (data?.session) return "signedIn";
  if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) return "exists";
  return "verify";
}

export function checkEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email ?? "").trim()) ? "" : "Enter a valid email address.";
}

export function checkPassword(password) {
  return (password ?? "").length >= MIN_PASSWORD ? "" : `Use at least ${MIN_PASSWORD} characters.`;
}

export function checkSignUp({ name, email, password }) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Enter your name.";
  if (trimmed.length > MAX_NAME) return `Your name can be at most ${MAX_NAME} characters.`;
  return checkEmail(email) || checkPassword(password);
}

// ---- Phone + username accounts ---------------------------------------------------------------
// The same rules as the backend (app/account_rules.py), so the form catches mistakes before sending.
// The server checks again and has the last word.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const SCHOOL_MAX = 120;
export const PHONE_HELP = "Enter an Ethiopian phone number, like 0911 234 567.";

// "+2519XXXXXXXX" from the ways people write it (0911..., 911..., 251911..., +251 911...), or null.
export function normalizePhone(value) {
  if (typeof value !== "string") return null;
  let digits = value.trim().replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
    if (!digits.startsWith("251")) return null;
  }
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("251")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  const phone = `+251${digits}`;
  return /^\+251[79]\d{8}$/.test(phone) ? phone : null;
}

export function checkUsername(value) {
  const name = (value ?? "").trim().toLowerCase();
  if (!name) return "Choose a username.";
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return `Usernames are ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
  }
  if (!/^[a-z0-9_]+$/.test(name)) return "Use only letters, numbers and _ in your username.";
  return "";
}

export function checkPhone(value) {
  return normalizePhone(value) ? "" : PHONE_HELP;
}

export function checkSchool(value) {
  const school = (value ?? "").trim();
  if (school.length < 2) return "Enter your school or university.";
  if (school.length > SCHOOL_MAX) return `School name can be at most ${SCHOOL_MAX} characters.`;
  return "";
}

// The first problem with the sign-up form, or "".
export function checkRegister({ username, phone, password, school }) {
  return checkUsername(username) || checkPhone(phone) || checkPassword(password) || checkSchool(school);
}

// Students who signed up by phone log in with their phone or username. Older accounts and
// teachers use an email address.
export const isEmailLogin = (identifier) => (identifier ?? "").includes("@");
