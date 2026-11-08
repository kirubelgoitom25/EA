import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { closeServer, installFetch, loadModule } from "./helpers.mjs";

const P = await loadModule("/src/lib/payments.js");
const { adminApi, paymentsApi } = await loadModule("/src/lib/paymentsApi.js");
const Payments = await loadModule("/src/pages/Payments.jsx");
const People = await loadModule("/src/pages/People.jsx");
const Plans = await loadModule("/src/pages/Plans.jsx");
const Cards = await loadModule("/src/components/studio/PricingCards.jsx");
test.after(closeServer);

const render = (el) => renderToStaticMarkup(h(MemoryRouter, null, el));
const noop = () => {};
const form = { price: "500", duration: "30", customDays: "", instructions: "Pay me" };

test("free, paid and Pro each send what the server expects", () => {
  assert.deepEqual(P.pricingCheck({ tier: "free" }).values, { access_tier: "free" });
  assert.deepEqual(P.pricingCheck({ tier: "pro" }).values, { access_tier: "pro" });
  assert.deepEqual(P.pricingCheck({ tier: "paid", ...form }).values, {
    access_tier: "paid", price: "500", access_days: 30, payment_instructions: "Pay me",
  });
  assert.equal(P.pricingCheck({ tier: "paid", ...form, price: "0" }).ok, false);
  // Older callers without a tier are unchanged.
  assert.deepEqual(P.pricingCheck({ paid: false }).values, { price: "0" });
});

test("the course's option, and which changes keep existing learners", () => {
  assert.equal(P.tierOf({ access_tier: "pro", price: "0" }), "pro");
  assert.equal(P.tierOf({ price: "500.00" }), "paid");
  assert.equal(P.tierOf({ price: "0" }), "free");
  for (const [from, to] of [["free", "paid"], ["free", "pro"], ["pro", "paid"]]) assert.ok(P.isStricter(from, to));
  for (const [from, to] of [["paid", "pro"], ["paid", "free"], ["pro", "free"], ["pro", "pro"]]) assert.ok(!P.isStricter(from, to));
});

test("phones read the way people write them, and hidden emails never show", () => {
  assert.equal(P.phoneText("+251911234567"), "0911 234 567");
  assert.equal(P.phoneText("weird"), "weird");
  assert.equal(P.contactLine({ username: "liya", phone: "+251911234567", email: null }), "@liya · 0911 234 567");
  assert.equal(P.contactLine({ email: "t@example.com" }), "t@example.com");
});

test("temporary passwords have no look-alike characters", () => {
  const password = P.makeTemporaryPassword(10, (n) => Uint32Array.from({ length: n }, (_, i) => i * 7));
  assert.equal(password.length, 10);
  assert.doesNotMatch(password, /[01ilo]/i);
  assert.match(P.makeTemporaryPassword(), /^[a-z2-9]{10}$/);
});

test("the pricing card offers free, paid and Pro", () => {
  const course = { id: "c", owner_id: "t", access_tier: "pro", price: "0", currency: "ETB", access_days: null };
  const html = render(h(Cards.PricingCard, { course, setDirty: noop, onSave: noop }));
  for (const label of ["Free", "Paid", "Pro"]) assert.match(html, new RegExp(`/> ${label}<`));
  assert.match(html, /checked=""[^>]*\/> Pro/);
  assert.match(html, /keeps it even without Pro/);
  assert.doesNotMatch(html, /Price \(ETB\)/);
});

const planItem = {
  id: "r2", kind: "plan", status: "pending",
  student: { id: "s1", name: "Liya", email: null, username: "liya_a", phone: "+251911234567" },
  course: null,
  plan: { id: "pro-1", title: "Pro, 1 month", price: "150.00", currency: "ETB", access_days: 30 },
  amount: "150.00", currency: "ETB", access_days: 30, terms_changed: false, image_reused: false,
  current_access: { state: "active", expires_at: "2026-11-20T00:00:00Z" },
  after_approval: { permanent: false, expires_at: "2026-12-20T00:00:00Z" },
  review_note: null, created_at: "2026-11-08T00:00:00Z", reviewed_at: null,
};

test("a Pro request shows the plan and how to reach the student", () => {
  const html = render(h(Payments.RequestDetail, { item: planItem, busy: false, onApprove: noop, onReject: noop }));
  assert.match(html, /EA Pro/);
  assert.match(html, /Pro, 1 month/);
  assert.match(html, /0911 234 567/);
  assert.match(html, /@liya_a/);
  assert.match(html, /has Pro until 20 Nov 2026/);
  const row = render(h(Payments.RequestRow, { item: planItem, open: false, onToggle: noop }));
  assert.match(row, /EA Pro · .*Pro, 1 month/);
});

const student = {
  id: "p1", name: "liya_a", email: null, username: "liya_a", phone: "+251911234567", school: "AAU",
  role: "student", is_active: true, is_admin: false, requests: [], access: [], owned_courses: [],
  pro: { state: "active", active: true, expires_at: "2026-12-01T00:00:00Z", source: "payment" },
};
const panel = (p) =>
  render(h(People.PersonPanel, {
    person: p, me: "admin", courses: [], busy: false, onUpdate: noop, onGrant: noop, onRevoke: noop,
    onGrantPro: noop, onRevokePro: noop, onPassword: noop,
  }));

test("the admin sees Pro, contact and school, and can give or end Pro", () => {
  const html = panel(student);
  assert.match(html, /Pro until 1 Dec 2026/);
  assert.match(html, /Revoke Pro/);
  assert.match(html, /Give Pro/);
  assert.match(html, /0911 234 567 · AAU/);
  assert.match(html, /Set temporary password/);
  assert.match(html, /Courses this student bought are separate/);
  assert.doesNotMatch(panel({ ...student, pro: { state: "none", active: false } }), /Revoke Pro/);
});

test("the plan form refuses what the server would", () => {
  const ok = { title: "Pro", price: "150", duration: "30", customDays: "", instructions: "Telebirr" };
  assert.deepEqual(Plans.planCheck(ok).values, { title: "Pro", price: "150", access_days: 30, payment_instructions: "Telebirr" });
  for (const bad of [{ title: " " }, { price: "0" }, { price: "1.234" }, { instructions: "" }, { duration: "custom", customDays: "0" }]) {
    assert.equal(Plans.planCheck({ ...ok, ...bad }).ok, false, JSON.stringify(bad));
  }
});

test("every new call matches a backend route", async () => {
  const table = [
    [() => paymentsApi.listRequests({ kind: "plan" }), "GET", "/teacher/payment-requests?kind=plan"],
    [() => adminApi.setPassword("p1", "abcdefgh"), "PUT", "/admin/people/p1/password"],
    [() => adminApi.grantPro("p1", null), "PUT", "/admin/people/p1/pro"],
    [() => adminApi.revokePro("p1"), "DELETE", "/admin/people/p1/pro"],
    [() => adminApi.plans(), "GET", "/admin/plans"],
    [() => adminApi.createPlan({}), "POST", "/admin/plans"],
    [() => adminApi.updatePlan("pro 1", {}), "PATCH", "/admin/plans/pro%201"],
  ];
  for (const [fn, method, target] of table) {
    const calls = installFetch(() => ({ json: {} }));
    await fn();
    const url = new URL(calls[0].url);
    assert.equal(calls[0].method, method);
    assert.equal(url.pathname + url.search, target);
  }
  const calls = installFetch(() => ({ json: {} }));
  await adminApi.grantPro("p1", null);
  assert.deepEqual(calls[0].body, { access_days: null });
});
