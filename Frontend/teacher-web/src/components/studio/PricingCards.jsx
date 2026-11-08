import { useCallback, useEffect, useState } from "react";
import { studioApi } from "../../lib/studioApi.js";
import { adminApi, paymentsApi } from "../../lib/paymentsApi.js";
import {
  ACCESS_LABEL,
  DURATIONS,
  MAX_INSTRUCTIONS_LEN,
  SOURCE_LABEL,
  TIERS,
  accessLine,
  contactLine,
  durationKey,
  isStricter,
  pricingCheck,
  tierOf,
} from "../../lib/payments.js";
import { friendlyError } from "../../lib/studio.js";
import { ConfirmDialog, ErrorNote } from "./Parts.jsx";

const isPaid = (course) => tierOf(course) === "paid";

const STRICTER_TEXT = {
  "free>paid": ["Start charging for this course?", "Set price", "Students who have not started will need to pay, even if they already added this course on their phone."],
  "free>pro": ["Make this a Pro course?", "Make Pro", "Students who have not started will need EA Pro to open it."],
  "pro>paid": ["Start charging for this Pro course?", "Set price", "Pro members who have not started will need to buy it."],
};

// Free, paid (price, duration and how to pay) or Pro. A course with no owner stays free.
export function PricingCard({ course, busy, onSave, setDirty }) {
  const saved = tierOf(course);
  const [tier, setTier] = useState(saved);
  const [price, setPrice] = useState(isPaid(course) ? String(Number(course.price)) : "");
  const [duration, setDuration] = useState(durationKey(course.access_days));
  const [customDays, setCustomDays] = useState(course.access_days ? String(course.access_days) : "");
  const [instructions, setInstructions] = useState(course.payment_instructions ?? "");
  const [confirming, setConfirming] = useState(false);
  const [learners, setLearners] = useState(null);

  const paid = tier === "paid";
  const check = pricingCheck({ tier, price, duration, customDays, instructions });
  const savedDays = course.access_days ?? null;
  const changed =
    tier !== saved ||
    (paid &&
      (Number(price) !== Number(course.price) ||
        check.values?.access_days !== savedDays ||
        instructions.trim() !== (course.payment_instructions ?? "")));

  useEffect(() => {
    setDirty("pricing", changed);
    return () => setDirty("pricing", false);
  }, [changed, setDirty]);

  if (!course.owner_id) {
    return (
      <section className="card editor-card" aria-label="Pricing">
        <p className="label">Access</p>
        <p className="sub">This course has no owner, so it stays free. Nobody could review its payments.</p>
      </section>
    );
  }

  const save = () => onSave(check.values);
  const stricter = isStricter(saved, tier);
  const text = STRICTER_TEXT[`${saved}>${tier}`];

  const submit = async (event) => {
    event.preventDefault();
    if (!changed || !check.ok || busy) return;
    if (stricter) {
      // Stats are hidden below 3 learners, so the number is a bonus, not a promise.
      setLearners(null);
      studioApi.courseStats(course.id).then((s) => setLearners(s.learners ?? null)).catch(() => {});
      setConfirming(true);
      return;
    }
    await save();
  };

  return (
    <form className="card editor-card" onSubmit={submit} aria-label="Pricing">
      <p className="label">Access</p>
      <div className="choice-row" role="radiogroup" aria-label="Free, paid or Pro">
        {TIERS.map((t) => (
          <label className="choice" key={t.key}>
            <input type="radio" name="tier" checked={tier === t.key} onChange={() => setTier(t.key)} /> {t.label}
          </label>
        ))}
      </div>
      <p className="sub">{TIERS.find((t) => t.key === tier)?.hint}</p>

      {tier === "pro" && (
        <p className="sub">
          Students open it while their EA Pro membership is active. Anyone who already bought it, or
          already started it, keeps it even without Pro.
        </p>
      )}

      {paid && (
        <>
          <div className="field-pair">
            <label className="field">
              <span className="label">Price ({course.currency})</span>
              <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="500" />
            </label>
            <label className="field">
              <span className="label">Access lasts</span>
              <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {DURATIONS.map((d) => (
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
            <span className="label">How students pay you</span>
            <textarea
              className="input"
              rows={3}
              value={instructions}
              maxLength={MAX_INSTRUCTIONS_LEN}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="For example: send the amount to Telebirr 09XX XXX XXX, then upload the screenshot."
            />
          </label>
          <p className="sub">Students see this before paying. Access starts when you approve their payment.</p>
        </>
      )}

      {changed && !check.ok && <p className="hint">{check.reason}</p>}
      <div className="form-actions">
        <button type="submit" className="btn" disabled={!changed || !check.ok || busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={text?.[0]}
        confirmLabel={text?.[1] ?? "Save"}
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          await save();
          setConfirming(false);
        }}
      >
        <p>
          {learners
            ? `${learners} students with recorded progress keep access for free, permanently.`
            : "Students with recorded progress keep access for free, permanently."}
        </p>
        <p>{text?.[2]}</p>
      </ConfirmDialog>
    </form>
  );
}

// Who holds access to this course, and the way to end it.
export function PaidStudentsCard({ courseId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => paymentsApi.courseAccess(courseId).then(setRows).catch((err) => setError(friendlyError(err.message))),
    [courseId],
  );
  useEffect(() => {
    load();
  }, [load]);

  const revoke = async () => {
    setBusy(true);
    setError("");
    try {
      await paymentsApi.revoke(courseId, target.student.id);
      setTarget(null);
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };

  if (error && !rows) return <ErrorNote message={error} />;
  if (!rows) return <div className="skeleton" />;
  return (
    <section className="card classes-card" aria-label="Paid students">
      <div className="classes-head">
        <p className="label">Paid students</p>
        <p className="sub">Revoking ends access now. Payment history and the student's progress stay.</p>
      </div>
      <ErrorNote message={error} />
      {rows.length === 0 && <p className="empty-inline">Nobody has bought this course yet.</p>}
      {rows.map((row) => (
        <div className="row" key={row.student.id}>
          <div className="who">
            <span className="name">{row.student.name}</span>
            <span className="sub">
              {[contactLine(row.student), SOURCE_LABEL[row.source] ?? row.source, accessLine(row)].filter(Boolean).join(" · ")}
            </span>
          </div>
          <span className={`pill${row.state === "active" ? " pill-live" : " pill-cold"}`}>{ACCESS_LABEL[row.state]}</span>
          {row.state === "active" && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setTarget(row)}>
              Revoke
            </button>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={Boolean(target)}
        title={`Revoke ${target?.student.name}'s access?`}
        confirmLabel="Revoke access"
        danger
        busy={busy}
        onCancel={() => setTarget(null)}
        onConfirm={revoke}
      >
        <p>They lose this course right away. Their progress and payment history stay.</p>
      </ConfirmDialog>
    </section>
  );
}

// Main admin only. Pending payment requests follow the course to its new owner.
export function OwnerCard({ course, onChanged }) {
  const [teachers, setTeachers] = useState(null);
  const [ownerId, setOwnerId] = useState(course.owner_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    adminApi
      .people({ role: "teacher", limit: 200 })
      .then((data) => live && setTeachers(data.items.filter((t) => t.is_active)))
      .catch((err) => live && setError(friendlyError(err.message)));
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await adminApi.setOwner(course.id, ownerId);
      await onChanged();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card editor-card" aria-label="Course owner">
      <p className="label">Course owner</p>
      <ErrorNote message={error} />
      <div className="field-pair">
        <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Owner" disabled={!teachers}>
          {!course.owner_id && <option value="">No owner</option>}
          {/* The owner may be turned off, and so not listed. Never show someone else in their place. */}
          {course.owner_id && !(teachers ?? []).some((t) => t.id === course.owner_id) && (
            <option value={course.owner_id}>Current owner</option>
          )}
          {(teachers ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button type="button" className="btn" onClick={save} disabled={busy || !ownerId || ownerId === course.owner_id}>
          {busy ? "Saving…" : "Change owner"}
        </button>
      </div>
      <p className="sub">
        The new owner reviews this course's payments.
        {!course.owner_id && " A published course that gains an owner becomes visible to all students."}
      </p>
    </section>
  );
}
