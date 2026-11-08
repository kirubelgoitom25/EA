import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUTH_REDIRECT, callbackLog, checkEmail, checkPassword, checkSignUp, googleError, isAuthCallback, readCallback,
  signUpOutcome,
} from "../services/authModel.js";

test("sign-in logs say what happened without ever holding a code", () => {
  assert.deepEqual(callbackLog(`${AUTH_REDIRECT}?code=secret-code`), { hasCode: true, errorCode: null, error: null });
  const failed = callbackLog(
    `${AUTH_REDIRECT}?error=server_error&error_code=unexpected_failure` +
      "&error_description=Unable+to+exchange+external+code%3A+4%2F0Asecret-code",
  );
  assert.deepEqual(failed, {
    hasCode: false,
    errorCode: "unexpected_failure",
    error: "Unable to exchange external code: 4/<hidden>",
  });
});

test("with no email provider yet, nothing offers an email code that could never arrive", () => {
  const login = readFileSync(new URL("../components/LoginScreen.js", import.meta.url), "utf8");
  // The email reset is reachable only behind the switch; otherwise the student is told who resets it.
  assert.equal(login.split('go("forgot")').length, 2);
  assert.match(login, /EMAIL_SIGNUP_OPEN && identifier\.includes\("@"\)\s*\? \(setEmail\(identifier\.trim\(\)\), go\("forgot"\)\)/);
  assert.match(login, /set a temporary password for you/);
  // Email sign-up is never opened from the login form: "Create an account" goes to phone sign-up.
  assert.equal(login.split('go("signup")').length, 2);
  assert.ok(login.indexOf('go("signup")') > login.indexOf('mode === "verify"'));
  assert.match(login, /label="New here\? Create an account" variant="text" onPress=\{\(\) => go\("register"\)\}/);
});

test("Google sign-in is paused: its button only shows behind the switch", () => {
  const login = readFileSync(new URL("../components/LoginScreen.js", import.meta.url), "utf8");
  assert.equal(login.split('label="Continue with Google"').length, 2);
  const at = login.indexOf('label="Continue with Google"');
  assert.match(login.slice(at - 200, at), /GOOGLE_SIGNIN_OPEN &&/);
});

test("only our own callback is treated as a sign-in", () => {
  assert.equal(isAuthCallback(`${AUTH_REDIRECT}?code=abc`), true);
  assert.equal(isAuthCallback("https://example.com/auth-callback?code=abc"), false);
  assert.equal(isAuthCallback(null), false);
});

test("the code is read from the query string", () => {
  assert.equal(readCallback(`${AUTH_REDIRECT}?code=abc-123`).code, "abc-123");
});

test("errors are read from the query string or after the #", () => {
  const query = readCallback(`${AUTH_REDIRECT}?error=access_denied&error_code=user_banned&error_description=User+is+banned`);
  assert.equal(query.error, "User is banned");
  assert.equal(query.errorCode, "user_banned");
  assert.equal(readCallback(`${AUTH_REDIRECT}#error=server_error&error_description=Oops%20there`).error, "Oops there");
});

test("a callback with nothing in it has no code", () => {
  assert.equal(readCallback(AUTH_REDIRECT).code, undefined);
});

test("a turned-off account is recognised, and other failures read plainly", () => {
  assert.equal(googleError({ error: "User is banned" }).banned, true);
  assert.equal(googleError({ errorCode: "user_banned" }).banned, true);
  assert.match(googleError({ error: "Signups not allowed for this instance" }).message, /aren't open yet/);
  assert.match(googleError({ error: "boom" }).message, /Couldn't sign in with Google/);
});

test("what a sign-up answer means", () => {
  assert.equal(signUpOutcome({ session: { access_token: "t" }, user: {} }), "signedIn"); // confirmation off
  assert.equal(signUpOutcome({ session: null, user: { identities: [{}] } }), "verify");
  assert.equal(signUpOutcome({ session: null, user: { identities: [] } }), "exists");
});

test("the form asks for the least it can, and says what's wrong", () => {
  const good = { name: "Hana", email: "hana@example.com", password: "longenough" };
  assert.equal(checkSignUp(good), "");
  assert.match(checkSignUp({ ...good, name: "  " }), /name/);
  assert.match(checkSignUp({ ...good, name: "x".repeat(61) }), /at most 60/);
  assert.match(checkSignUp({ ...good, email: "nope" }), /valid email/);
  assert.match(checkSignUp({ ...good, password: "short" }), /at least 8/);
  assert.equal(checkEmail(" hana@example.com "), "");
  assert.equal(checkPassword("12345678"), "");
});
