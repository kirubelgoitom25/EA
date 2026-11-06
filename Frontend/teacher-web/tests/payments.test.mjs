import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { closeServer, installFetch, loadModule } from "./helpers.mjs";

const P = await loadModule("/src/lib/payments.js");
const { paymentsApi, adminApi } = await loadModule("/src/lib/paymentsApi.js");
const { api } = await loadModule("/src/lib/api.js");
const Payments = await loadModule("/src/pages/Payments.jsx");
const People = await loadModule("/src/pages/People.jsx");
const Cards = await loadModule("/src/components/studio/PricingCards.jsx");
test.after(closeServer);

const render = (el) => renderToStaticMarkup(h(MemoryRouter, null, el));
const noop = () => {};
const form = { paid: true, price: "500", duration: "30", customDays: "", instructions: "Pay me" };

const item = {
  id: "r1",
  status: "pending",
  student: { id: "s1", name: "Hana", email: "hana@example.com" },
  course: { id: "c1", title: "Biology", price: "500.00", currency: "ETB", access_days: 30 },
  amount: "500.00",
  currency: "ETB",
  access_days: 30,
  terms_changed: false,
  image_reused: false,
  current_access: null,
  after_approval: { permanent: false, expires_at: "2026-12-06T00:00:00Z" },
  review_note: null,
  created_at: "2026-11-06T00:00:00Z",
  reviewed_at: null,
};

test("money reads like a price", () => {
  assert.equal(P.money("500.00"), "500 ETB");
  assert.equal(P.money("1500.50", "ETB"), "1,500.50 ETB");
});

test("durations are named the way teachers think of them", () => {
  assert.equal(P.durationLabel(null), "Permanent access");
  assert.equal(P.durationLabel(30), "30 days");
  assert.equal(P.durationLabel(1), "1 day");
  assert.equal(P.durationLabel(90), "3 months");
  assert.equal(P.durationLabel(365), "1 year");
  assert.equal(P.durationKey(null), "permanent");
  assert.equal(P.durationKey(90), "90");
  assert.equal(P.durationKey(45), "custom");
});

test("the pricing form builds what the server expects", () => {
  assert.deepEqual(P.pricingCheck({ paid: false }).values, { price: "0" });
  assert.deepEqual(P.pricingCheck(form).values, { price: "500", access_days: 30, payment_instructions: "Pay me" });
  assert.equal(P.pricingCheck({ ...form, duration: "permanent" }).values.access_days, null);
  assert.equal(P.pricingCheck({ ...form, duration: "custom", customDays: "45" }).values.access_days, 45);
});

test("the pricing form refuses what the server would", () => {
  for (const bad of [
    { price: "" }, { price: "0" }, { price: "-5" }, { price: "abc" }, { price: "1.234" }, { price: "2000000" },
    { instructions: "  " },
    { duration: "custom", customDays: "" }, { duration: "custom", customDays: "1.5" }, { duration: "custom", customDays: "0" },
  ]) {
    const result = P.pricingCheck({ ...form, ...bad });
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.reason);
  }
});

test("the reviewer is warned about what approving will do", () => {
  assert.deepEqual(P.reviewWarnings(item), []);
  const extends_ = P.reviewWarnings({ ...item, current_access: { state: "active", expires_at: "2026-11-20T00:00:00Z" } });
  assert.match(extends_[0], /until 20 Nov 2026.*extends it to 6 Dec 2026/);
  const permanent = P.reviewWarnings({ ...item, current_access: { state: "active", expires_at: null }, after_approval: { permanent: true, expires_at: null } });
  assert.match(permanent[0], /already has permanent access/);
  assert.match(P.reviewWarnings({ ...item, current_access: { state: "revoked", expires_at: null } })[0], /revoked/);
  assert.match(P.reviewWarnings({ ...item, terms_changed: true })[0], /500 ETB, 30 days/);
  assert.match(P.reviewWarnings({ ...item, image_reused: true })[0], /same image/);
});

test("every call matches a route in docs/API_CONTRACT.md", async () => {
  const table = [
    [() => paymentsApi.listRequests({ status: "pending", course_id: "", limit: 1 }), "GET", "/teacher/payment-requests?status=pending&limit=1"],
    [() => paymentsApi.approve("r1"), "POST", "/teacher/payment-requests/r1/approve"],
    [() => paymentsApi.reject("r1", ""), "POST", "/teacher/payment-requests/r1/reject"],
    [() => paymentsApi.courseAccess("c 1"), "GET", "/teacher/courses/c%201/access"],
    [() => paymentsApi.revoke("c1", "s1"), "DELETE", "/teacher/courses/c1/access/s1"],
    [() => adminApi.people({ role: "teacher", q: "a b" }), "GET", "/admin/people?role=teacher&q=a+b"],
    [() => adminApi.person("p1"), "GET", "/admin/people/p1"],
    [() => adminApi.updatePerson("p1", { is_active: false }), "PATCH", "/admin/people/p1"],
    [() => adminApi.setOwner("c1", "t1"), "PUT", "/admin/courses/c1/owner"],
    [() => adminApi.grant("c1", "s1", null), "PUT", "/admin/courses/c1/access/s1"],
  ];
  for (const [fn, method, target] of table) {
    const calls = installFetch(() => ({ json: {} }));
    await fn();
    const url = new URL(calls[0].url);
    assert.equal(calls[0].method, method);
    assert.equal(url.pathname + url.search, target);
  }
});

test("a rejection with no reason sends null, and a grant can be permanent", async () => {
  let calls = installFetch(() => ({ json: {} }));
  await paymentsApi.reject("r1", "");
  assert.deepEqual(calls[0].body, { note: null });
  calls = installFetch(() => ({ json: {} }));
  await adminApi.grant("c1", "s1", null);
  assert.deepEqual(calls[0].body, { access_days: null });
});

test("proof images arrive as a blob, and failures still read as errors", async () => {
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  const blob = await api.blob("/x");
  assert.equal(blob.size, 3);
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Request not found" }), { status: 404 });
  await assert.rejects(() => api.blob("/x"), /Request not found/);
});

test("a pending request can be decided, and warns to check the money", () => {
  const html = render(h(Payments.RequestDetail, { item, busy: false, onApprove: noop, onReject: noop }));
  assert.match(html, /Approve/);
  assert.match(html, /Reject/);
  assert.match(html, /optional/);
  assert.match(html, /A screenshot can be faked/);
  assert.match(html, /hana@example.com/);
  assert.match(html, /500 ETB/);
});

test("a decided request shows the outcome and offers no decision", () => {
  const decided = { ...item, status: "rejected", after_approval: null, review_note: "Blurry", reviewed_at: "2026-11-07T00:00:00Z", reviewed_by_name: "Selam" };
  const html = render(h(Payments.RequestDetail, { item: decided, busy: false, onApprove: noop, onReject: noop }));
  assert.match(html, /Blurry/);
  assert.match(html, /by Selam/);
  assert.doesNotMatch(html, />Approve</);
  assert.doesNotMatch(html, />Reject</);
});

test("the pricing card: a course with no owner stays free", () => {
  const html = render(h(Cards.PricingCard, { course: { id: "c", owner_id: null, price: "0", currency: "ETB" }, setDirty: noop, onSave: noop }));
  assert.match(html, /stays free/);
  assert.doesNotMatch(html, /<input/);
});

test("the pricing card shows the saved terms in ETB", () => {
  const course = { id: "c", owner_id: "t", price: "500.00", currency: "ETB", access_days: 90, payment_instructions: "Telebirr 0911" };
  const html = render(h(Cards.PricingCard, { course, setDirty: noop, onSave: noop }));
  assert.match(html, /Price \(ETB\)/);
  assert.match(html, /value="500"/);
  assert.match(html, /Telebirr 0911/);
  assert.match(html, /<option value="90" selected/);
});

const person = {
  id: "p1", name: "Hana", email: "h@example.com", role: "student", is_active: true, is_admin: false,
  requests: [], access: [{ course_id: "c1", course_title: "Biology", state: "active", expires_at: null, source: "admin" }], owned_courses: [],
};
const panel = (p, me = "admin") =>
  render(h(People.PersonPanel, { person: p, me, courses: [], busy: false, onUpdate: noop, onGrant: noop, onRevoke: noop }));

test("the admin can manage a student", () => {
  const html = panel(person);
  assert.match(html, /Turn account off/);
  assert.match(html, /Make teacher/);
  assert.match(html, /Revoke/);
  assert.match(html, /Grant or extend access/);
});

test("the admin's own account offers no way to lock themself out", () => {
  for (const html of [panel({ ...person, id: "admin" }), panel({ ...person, is_admin: true })]) {
    assert.doesNotMatch(html, /Turn account off/);
    assert.doesNotMatch(html, /Make teacher/);
  }
});

test("a teacher can be returned to student, and has no course access section", () => {
  const html = panel({ ...person, role: "teacher", access: [], owned_courses: [{ id: "c", title: "Chem", status: "draft" }] });
  assert.match(html, /Return to student/);
  assert.match(html, /Chem/);
  assert.doesNotMatch(html, /Grant or extend/);
});

test("the owner box never shows someone else when the owner isn't listed", () => {
  // A turned-off owner is left out of the teacher list. The browser would show the first name.
  const html = render(h(Cards.OwnerCard, { course: { id: "c", owner_id: "t1" }, onChanged: noop }));
  assert.match(html, /<option value="t1" selected[^>]*>Current owner/);
});

test("revoke is only offered while access is active", () => {
  const expired = { ...person, access: [{ ...person.access[0], state: "expired", expires_at: "2026-01-01T00:00:00Z" }] };
  assert.doesNotMatch(panel(expired), />Revoke</);
});

test("a phone-width nav scrolls, and keeps the pending badge", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/studio.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar nav \{[^}]*overflow-x: auto/);
  const app = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(app, /\.nav-item span:not\(\.nav-count\)/);
});
