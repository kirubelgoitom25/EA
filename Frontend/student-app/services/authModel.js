// Sign-up and sign-in rules as plain functions (no React, no network), so they're easy to test.

export const AUTH_SCHEME = "ea-student";
export const AUTH_REDIRECT = `${AUTH_SCHEME}://auth-callback`;

// Google is how new students join. Creating an account by email and resetting a password both
// need an email provider to deliver codes, so they stay hidden until one is set up. Existing
// students can always log in with their password. Turn this on when email works.
export const EMAIL_SIGNUP_OPEN = false;

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
