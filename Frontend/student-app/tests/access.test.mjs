import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankEntries } from "../components/rankingModel.js";
import {
  accessLine, buyLabel, canRenew, dateText, durationText, isLocked, isOpen, money, withPurchased,
} from "../services/access.js";

const paid = (access, extra = {}) => ({ id: "c", price: 500, currency: "ETB", accessDays: 30, access, ...extra });
const state = (name, extra = {}) => ({ state: name, expiresAt: null, pendingRequests: 0, ...extra });

test("only free, class and active courses open", () => {
  for (const name of ["free", "class", "active"]) assert.equal(isOpen(paid(state(name))), true, name);
  for (const name of ["locked", "expired", "revoked"]) assert.equal(isLocked(paid(state(name))), true, name);
});

test("a server that sends no access yet leaves everything open, so old backends keep working", () => {
  assert.equal(isOpen({ id: "c" }), true);
  assert.equal(accessLine({ id: "c" }), null);
});

test("prices read like prices", () => {
  assert.equal(money(500), "500 ETB");
  assert.equal(money(1500.5), "1,500.50 ETB");
  assert.equal(money(1000000), "1,000,000 ETB");
});

test("durations", () => {
  assert.equal(durationText(null), "Permanent access");
  assert.equal(durationText(1), "1 day of access");
  assert.equal(durationText(30), "30 days of access");
  assert.equal(durationText(90), "3 months of access");
  assert.equal(durationText(365), "1 year of access");
});

test("dates are the same on every phone", () => {
  assert.match(dateText("2026-12-06T12:00:00Z"), /^\d{1,2} Dec 2026$/);
  assert.equal(dateText(null), "");
});

test("the course row says where the student stands", () => {
  assert.equal(accessLine({ price: 0, access: state("free") }), null);
  assert.equal(accessLine(paid(state("locked"))), "500 ETB");
  assert.equal(accessLine(paid(state("locked", { pendingRequests: 1 }))), "Payment being reviewed");
  assert.equal(accessLine(paid(state("expired"))), "Access ended");
  assert.equal(accessLine(paid(state("expired", { pendingRequests: 2 }))), "Payment being reviewed");
  assert.equal(accessLine(paid(state("revoked"))), "Access removed");
  assert.equal(accessLine(paid(state("class"))), "Included with your class");
  assert.equal(accessLine(paid(state("active"))), "Permanent access");
  assert.match(accessLine(paid(state("active", { expiresAt: "2026-12-06T12:00:00Z" }))), /^Access until .* Dec 2026$/);
});

test("renewing is offered for running time, never for permanent access", () => {
  assert.equal(canRenew(paid(state("active", { expiresAt: "2026-12-06T12:00:00Z" }))), true);
  assert.equal(canRenew(paid(state("active"))), false);
  assert.equal(canRenew(paid(state("class"))), false);
  assert.equal(buyLabel(paid(state("locked"))), "Get access");
  assert.equal(buyLabel(paid(state("expired"))), "Renew access");
});

test("a bought course joins Your courses, and nothing else changes", () => {
  const courses = [paid(state("active"), { id: "bought" }), paid(state("locked"), { id: "no" }), { id: "free", price: 0, access: state("free") }];
  assert.deepEqual(withPurchased(["free"], courses), ["free", "bought"]);
  const same = ["bought"];
  assert.equal(withPurchased(same, courses), same); // same list, so nothing re-renders or re-saves
});

test("uploads never go through fetch, which refuses React Native's { uri } file parts", () => {
  const api = readFileSync(new URL("../services/api.js", import.meta.url), "utf8");
  const upload = api.slice(api.indexOf("export async function submitPaymentRequest"), api.indexOf("export async function fetchMyPaymentRequests"));
  assert.match(upload, /uploadFile\(/);
  assert.doesNotMatch(upload, /request\(/);
  assert.match(api.slice(api.indexOf("async function uploadFile")), /new XMLHttpRequest\(\)/);
});

test("a rank from the server is kept, so 900th doesn't read as 51st", () => {
  const entries = [
    { id: "", name: "Top", xp: 100, position: 1 },
    { id: "me", name: "Me", xp: 1, position: 900 },
  ];
  const ranked = rankEntries(entries, "overall", "me");
  assert.deepEqual(ranked.map((e) => e.position), [1, 900]);
  assert.equal(ranked[1].isYou, true);
});

test("a class board with no positions still counts from 1", () => {
  const ranked = rankEntries([{ id: "a", name: "A", xp: 2 }, { id: "b", name: "B", xp: 1 }], "overall", "a");
  assert.deepEqual(ranked.map((e) => e.position), [1, 2]);
});
