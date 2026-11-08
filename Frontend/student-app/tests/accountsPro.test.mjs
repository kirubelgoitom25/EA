import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GOOGLE_SIGNIN_OPEN, checkPhone, checkRegister, checkSchool, checkUsername, isEmailLogin, normalizePhone,
} from "../services/authModel.js";
import {
  accessLine, isLocked, isOpen, isProCourse, planDurationText, proButtonLabel, proLine, withPurchased,
} from "../services/access.js";

test("Google is paused", () => {
  assert.equal(GOOGLE_SIGNIN_OPEN, false);
});

test("phone numbers are read the way the server stores them", () => {
  for (const written of ["0911234567", "0911 234 567", "911234567", "+251911234567", "251 911 234 567", "(091) 123-4567"]) {
    assert.equal(normalizePhone(written), "+251911234567", written);
  }
  assert.equal(normalizePhone("0711234567"), "+251711234567");
  for (const bad of ["", "abc", "0811234567", "091123456", "+1 555 123 4567", null]) {
    assert.equal(normalizePhone(bad), null, String(bad));
  }
});

test("the sign-up form says what's wrong, one thing at a time", () => {
  const ok = { username: "Liya_A", phone: "0911234567", password: "secret-12", school: "AAU" };
  assert.equal(checkRegister(ok), "");
  assert.match(checkRegister({ ...ok, username: "ab" }), /3 to 20/);
  assert.match(checkRegister({ ...ok, username: "li ya" }), /letters, numbers and _/);
  assert.match(checkRegister({ ...ok, phone: "12" }), /Ethiopian phone/);
  assert.match(checkRegister({ ...ok, password: "short" }), /8 characters/);
  assert.match(checkRegister({ ...ok, school: " " }), /school or university/);
  assert.equal(checkUsername("liya_a"), "");
  assert.equal(checkPhone("0911 234 567"), "");
  assert.match(checkSchool("x".repeat(121)), /at most 120/);
});

test("emails still log in as emails; anything else is a phone or username", () => {
  assert.equal(isEmailLogin("liya@gmail.com"), true);
  assert.equal(isEmailLogin("0911234567"), false);
  assert.equal(isEmailLogin("liya_a"), false);
});

const proCourse = (state, extra = {}) => ({ id: "p", price: 0, accessTier: "pro", access: { state, ...extra } });

test("a Pro course opens with Pro, a purchase or a class, and says which", () => {
  assert.equal(isProCourse(proCourse("pro")), true);
  assert.equal(isOpen(proCourse("pro")), true);
  assert.equal(isLocked(proCourse("pro_locked")), true);
  assert.equal(accessLine(proCourse("pro")), "Included with Pro");
  assert.equal(accessLine(proCourse("pro_locked")), "EA Pro");
  assert.equal(accessLine(proCourse("class")), "Included with your class");
  assert.equal(accessLine(proCourse("active", { expiresAt: null })), "Yours to keep");
  assert.match(accessLine(proCourse("active", { expiresAt: "2026-12-01T00:00:00Z" })), /^Yours until 1 Dec 2026$/);
});

test("older servers without a tier are never Pro", () => {
  assert.equal(isProCourse({ price: 0, access: { state: "free" } }), false);
  assert.equal(accessLine({ price: 0, access: { state: "free" } }), null);
});

test("a course bought before it became Pro still joins Your courses", () => {
  const courses = [proCourse("active"), proCourse("pro"), { id: "f", price: 0, access: { state: "free" } }];
  courses[0].id = "bought";
  assert.deepEqual(withPurchased([], courses), ["bought"]);
});

test("Pro reads plainly", () => {
  assert.equal(proLine({ state: "none" }), "Not a member yet");
  assert.equal(proLine({ state: "active", active: true, expiresAt: "2026-12-01T00:00:00Z" }), "Active until 1 Dec 2026");
  assert.equal(proLine({ state: "active", active: true, expiresAt: null }), "Active, no end date");
  assert.equal(proLine({ state: "expired", expiresAt: "2026-10-01T00:00:00Z" }), "Ended on 1 Oct 2026");
  assert.equal(proButtonLabel({ state: "none" }), "Get EA Pro");
  assert.equal(proButtonLabel({ state: "expired" }), "Renew EA Pro");
  assert.equal(planDurationText(30), "1 month");
  assert.equal(planDurationText(365), "1 year");
  assert.equal(planDurationText(45), "45 days");
});

test("the Pro upload goes through uploadFile too, never fetch", () => {
  const api = readFileSync(new URL("../services/api.js", import.meta.url), "utf8");
  const upload = api.slice(api.indexOf("export async function submitPlanRequest"), api.indexOf("export async function fetchMyPaymentRequests"));
  assert.match(upload, /uploadFile\(`\/plans\//);
  assert.doesNotMatch(upload, /request\(/);
});

test("a hidden internal address is never shown as the student's email", () => {
  const api = readFileSync(new URL("../services/api.js", import.meta.url), "utf8");
  assert.match(api, /email: me\.username \? null : me\.email/);
});
