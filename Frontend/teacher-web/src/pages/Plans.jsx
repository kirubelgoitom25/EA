import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { ErrorNote, Flash } from "../components/studio/Parts.jsx";
import { MAX_ACCESS_DAYS, MAX_INSTRUCTIONS_LEN, MAX_PRICE, durationLabel, money } from "../lib/payments.js";
import { adminApi } from "../lib/paymentsApi.js";
import { friendlyError } from "../lib/studio.js";

const PLAN_DURATIONS = [
  { key: "30", label: "1 month (30 days)", days: 30 },
  { key: "90", label: "3 months (90 days)", days: 90 },
  { key: "365", label: "1 year (365 days)", days: 365 },
  { key: "custom", label: "Custom" },
];
const keyOf = (days) => PLAN_DURATIONS.find((d) => d.days === days)?.key ?? "custom";

// Checks the plan form and builds what to send. Returns { ok, reason, values }.
export function planCheck({ title, price, duration, customDays, instructions }) {
  if (!(title ?? "").trim()) return { ok: false, reason: "Give the plan a name, like “Pro, 1 month”." };
  const amount = Number(price);
  if (String(price ?? "").trim() === "" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Enter a price above 0." };
  }
  if (amount > MAX_PRICE || Math.round(amount * 100) / 100 !== amount) {
    return { ok: false, reason: "Enter a price with at most 2 decimal places." };
  }
  let days = PLAN_DURATIONS.find((d) => d.key === duration)?.days;
  if (duration === "custom") {
    days = Number(customDays);
    if (!Number.isInteger(days) || days < 1 || days > MAX_ACCESS_DAYS) {
      return { ok: false, reason: `Enter a whole number of days, from 1 to ${MAX_ACCESS_DAYS}.` };
    }
  }
  if (!(instructions ?? "").trim()) return { ok: false, reason: "Tell students how to pay for Pro." };
  return {
    ok: true,
    reason: "",
    values: {
      title: title.trim(),
      price: String(price).trim(),
      access_days: days,
      payment_instructions: instructions.trim(),
    },
  };
}

function PlanForm({ plan, busy, onSave, onCancel }) {
  const [title, setTitle] = useState(plan?.title ?? "");
  const [price, setPrice] = useState(plan ? String(Number(plan.price)) : "");
  const [duration, setDuration] = useState(plan ? keyOf(plan.access_days) : "30");
  const [customDays, setCustomDays] = useState(plan ? String(plan.access_days) : "");
  const [instructions, setInstructions] = useState(plan?.payment_instructions ?? "");
  const check = planCheck({ title, price, duration, customDays, instructions });

  return (
    <form
      className="card editor-card"
      aria-label={plan ? "Edit plan" : "New plan"}
      onSubmit={(e) => {
        e.preventDefault();
        if (check.ok && !busy) onSave(check.values);
      }}
    >
      <p className="label">{plan ? "Edit plan" : "New plan"}</p>
      <label className="field">
        <span className="label">Name</span>
        <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Pro, 1 month" />
      </label>
      <div className="field-pair">
        <label className="field">
          <span className="label">Price (ETB)</span>
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="150" />
        </label>
        <label className="field">
          <span className="label">Pro lasts</span>
          <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
            {PLAN_DURATIONS.map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </label>
        {duration === "custom" && (
          <label className="field">
            <span className="label">Days</span>
            <input className="input" inputMode="numeric" value={customDays} onChange={(e) => setCustomDays(e.target.value)} placeholder="45" />
          </label>
        )}
      </div>
      <label className="field">
        <span className="label">How students pay EA</span>
        <textarea
          className="input"
          rows={3}
          value={instructions}
          maxLength={MAX_INSTRUCTIONS_LEN}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="For example: send the amount to Telebirr 09XX XXX XXX, then upload the screenshot."
        />
      </label>
      <p className="sub">Changing a price or duration never changes a request already sent: students get the terms they saw.</p>
      {!check.ok && (title || price || instructions) && <p className="hint">{check.reason}</p>}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn" disabled={!check.ok || busy}>
          {busy ? "Saving…" : plan ? "Save plan" : "Add plan"}
        </button>
      </div>
    </form>
  );
}

// Main admin only. What EA Pro costs, how long it lasts and how students pay.
export default function Plans() {
  const auth = useAuth();
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null); // a plan id, or "new"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const load = useCallback(() => adminApi.plans().then(setPlans), []);
  useEffect(() => {
    load().catch((err) => setError(friendlyError(err.message)));
  }, [load]);

  const act = async (work, message) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setFlash(message);
      setEditing(null);
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  // Only for tidiness: every /admin route refuses anyone who is not the main admin.
  if (auth && !auth.profile?.is_admin) return <Navigate to="/" replace />;

  return (
    <div className="studio">
      <header className="page-head">
        <div>
          <p className="label">Admin</p>
          <h1>EA Pro plans</h1>
          <p className="sub">Pro opens every Pro course while it lasts. You review Pro payments on the Payments page.</p>
        </div>
        {editing !== "new" && (
          <button type="button" className="btn" onClick={() => setEditing("new")}>
            New plan
          </button>
        )}
      </header>

      <Flash message={flash} onClose={() => setFlash("")} />
      <ErrorNote message={error} />

      {editing === "new" && (
        <PlanForm busy={busy} onCancel={() => setEditing(null)} onSave={(values) => act(() => adminApi.createPlan(values), "Plan added.")} />
      )}

      {!plans && !error && <div className="skeleton tall" />}
      {plans && (
        <section className="card" aria-label="Plans">
          {plans.length === 0 && <p className="empty-inline">No plans yet. Students can't get Pro until you add one.</p>}
          {plans.map((plan) =>
            editing === plan.id ? (
              <PlanForm
                key={plan.id}
                plan={plan}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={(values) => act(() => adminApi.updatePlan(plan.id, values), "Plan saved.")}
              />
            ) : (
              <div className="row" key={plan.id}>
                <div className="who">
                  <span className="name">{plan.title}</span>
                  <span className="sub">{money(plan.price, plan.currency)} · {durationLabel(plan.access_days)}</span>
                </div>
                <span className={`pill${plan.is_active ? " pill-live" : " pill-cold"}`}>{plan.is_active ? "On sale" : "Off"}</span>
                <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => setEditing(plan.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => adminApi.updatePlan(plan.id, { is_active: !plan.is_active }),
                      plan.is_active ? "Plan taken off sale. Members keep their Pro." : "Plan back on sale.",
                    )
                  }
                >
                  {plan.is_active ? "Take off sale" : "Put on sale"}
                </button>
              </div>
            ),
          )}
        </section>
      )}
    </div>
  );
}
