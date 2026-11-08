import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { ConfirmDialog, ErrorNote, Flash } from "../components/studio/Parts.jsx";
import { Tabs } from "../components/ui.jsx";
import {
  ACCESS_LABEL,
  DURATIONS,
  PRO_LABEL,
  accessLine,
  contactLine,
  durationLabel,
  makeTemporaryPassword,
  money,
  pricingCheck,
  proLine,
} from "../lib/payments.js";
import { adminApi, paymentsApi } from "../lib/paymentsApi.js";
import { friendlyError } from "../lib/studio.js";
import { studioApi } from "../lib/studioApi.js";

const PAGE = 50;
const ROLE_TABS = [
  { key: "", label: "Everyone" },
  { key: "student", label: "Students" },
  { key: "teacher", label: "Teachers" },
];

function GrantForm({ courses, busy, onGrant }) {
  const [courseId, setCourseId] = useState("");
  const [duration, setDuration] = useState("30");
  const [customDays, setCustomDays] = useState("");
  // Reuses the duration rules. The price and text only satisfy the shared check.
  const check = pricingCheck({ paid: true, price: "1", duration, customDays, instructions: "x" });

  return (
    <div className="field-pair">
      <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course">
        <option value="">Choose a course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
      </select>
      <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Duration">
        {DURATIONS.map((d) => (
          <option key={d.key} value={d.key}>{d.label}</option>
        ))}
      </select>
      {duration === "custom" && (
        <input className="input" inputMode="numeric" value={customDays} onChange={(e) => setCustomDays(e.target.value)} placeholder="Days" aria-label="Days" />
      )}
      <button type="button" className="btn" disabled={busy || !courseId || !check.ok} onClick={() => onGrant(courseId, check.values.access_days)}>
        Grant
      </button>
    </div>
  );
}

function ProForm({ busy, onGrant }) {
  const [duration, setDuration] = useState("30");
  const [customDays, setCustomDays] = useState("");
  const check = pricingCheck({ paid: true, price: "1", duration, customDays, instructions: "x" });
  return (
    <div className="field-pair">
      <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Pro duration">
        {DURATIONS.map((d) => (
          <option key={d.key} value={d.key}>{d.label}</option>
        ))}
      </select>
      {duration === "custom" && (
        <input className="input" inputMode="numeric" value={customDays} onChange={(e) => setCustomDays(e.target.value)} placeholder="Days" aria-label="Pro days" />
      )}
      <button type="button" className="btn" disabled={busy || !check.ok} onClick={() => onGrant(check.values.access_days)}>
        Give Pro
      </button>
    </div>
  );
}

export function PersonPanel({ person, me, courses, busy, onUpdate, onGrant, onRevoke, onGrantPro, onRevokePro, onPassword }) {
  const locked = person.id === me || person.is_admin;
  const student = person.role === "student";
  const pro = person.pro ?? { state: "none" };
  return (
    <div className="request-detail person-detail">
      <div className="request-side">
        {(contactLine(person) || person.school) && (
          <p className="sub">{[contactLine(person), person.school].filter(Boolean).join(" · ")}</p>
        )}
        {!locked && (
          <div className="form-actions">
            <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => onUpdate({ is_active: !person.is_active }, person.is_active ? "turn off" : "turn on")}>
              {person.is_active ? "Turn account off" : "Turn account on"}
            </button>
            <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => onUpdate({ role: student ? "teacher" : "student" }, student ? "promote" : "return")}>
              {student ? "Make teacher" : "Return to student"}
            </button>
            <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={onPassword}>
              Set temporary password
            </button>
          </div>
        )}
        {locked && <p className="sub">The main admin's account can't be changed here.</p>}

        {person.owned_courses.length > 0 && (
          <>
            <p className="label">Owns</p>
            {person.owned_courses.map((c) => (
              <p className="sub" key={c.id}>{c.title} · {c.status}</p>
            ))}
          </>
        )}

        {student && (
          <>
            <p className="label">EA Pro</p>
            <div className="row">
              <div className="who">
                <span className="name">{proLine(pro)}</span>
                <span className="sub">Pro opens Pro courses only. Courses this student bought are separate and stay theirs.</span>
              </div>
              <span className={`pill${pro.state === "active" ? " pill-live" : " pill-cold"}`}>{PRO_LABEL[pro.state] ?? pro.state}</span>
              {pro.state === "active" && (
                <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={onRevokePro}>
                  Revoke Pro
                </button>
              )}
            </div>
            <ProForm busy={busy} onGrant={onGrantPro} />

            <p className="label">Course access</p>
            {person.access.length === 0 && <p className="sub">No paid courses.</p>}
            {person.access.map((row) => (
              <div className="row" key={row.course_id}>
                <div className="who">
                  <span className="name">{row.course_title}</span>
                  <span className="sub">{accessLine(row)}</span>
                </div>
                <span className={`pill${row.state === "active" ? " pill-live" : " pill-cold"}`}>{ACCESS_LABEL[row.state]}</span>
                {row.state === "active" && (
                  <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => onRevoke(row.course_id)}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
            <p className="label">Grant or extend access</p>
            <GrantForm courses={courses} busy={busy} onGrant={onGrant} />

            <p className="label">Payment requests</p>
            {person.requests.length === 0 && <p className="sub">None.</p>}
            {person.requests.map((r) => (
              <p className="sub" key={r.id}>
                {r.course_title} · {money(r.amount, r.currency)} · {durationLabel(r.access_days)} · {r.status}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const CONFIRM_TEXT = {
  "turn off": ["Turn this account off?", "They are signed out and can't use EA until you turn it back on. Nothing is deleted."],
  "turn on": ["Turn this account back on?", "They can sign in again."],
  "revoke pro": ["Revoke EA Pro?", "Pro courses close for them now. Courses they bought, and Pro courses they had already started, stay open."],
  promote: ["Make this person a teacher?", "They can create courses and sign in to this dashboard. They leave the student rankings and can no longer use the student app."],
  return: ["Return this teacher to student?", "They lose the dashboard. Move their courses to another owner first."],
};

export default function People() {
  const auth = useAuth();
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [person, setPerson] = useState(null);
  const [courses, setCourses] = useState([]);
  const [pending, setPending] = useState(null); // { values, action }
  const [password, setPassword] = useState(null); // the temporary password being set
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const load = useCallback(
    async (offset = 0) => {
      const page = await adminApi.people({ role, q: query, limit: PAGE, offset });
      setData((current) => (offset ? { ...page, items: [...current.items, ...page.items] } : page));
    },
    [role, query],
  );

  useEffect(() => {
    load().catch((err) => setError(friendlyError(err.message)));
  }, [load]);

  useEffect(() => {
    studioApi.listCourses().then(setCourses).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const open = async (id) => {
    setError("");
    if (openId === id) {
      setOpenId(null);
      setPerson(null);
      return;
    }
    setOpenId(id);
    setPerson(null);
    try {
      setPerson(await adminApi.person(id));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  };

  const act = async (work, message) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setFlash(message);
      setPerson(await adminApi.person(openId));
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  // Only for tidiness: every /admin route refuses anyone who is not the main admin.
  if (auth && !auth.profile?.is_admin) return <Navigate to="/" replace />;

  const confirmText = pending ? CONFIRM_TEXT[pending.action] : null;
  return (
    <div className="studio">
      <header className="page-head">
        <div>
          <p className="label">Admin</p>
          <h1>People</h1>
          <p className="sub">{data ? `${data.total} account${data.total === 1 ? "" : "s"}` : ""}</p>
        </div>
      </header>

      <Flash message={flash} onClose={() => setFlash("")} />
      <ErrorNote message={error} />

      <Tabs tabs={ROLE_TABS} value={role} onChange={setRole} />
      <div className="filter-row">
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, username, phone or email" aria-label="Search people" />
      </div>

      {!data && !error && <div className="skeleton tall" />}
      {data && (
        <section className="card" aria-label="People">
          {data.items.length === 0 && <p className="empty-inline">Nobody matches.</p>}
          {data.items.map((p) => (
            <div className="request" key={p.id}>
              <button type="button" className="row request-head" onClick={() => open(p.id)} aria-expanded={openId === p.id}>
                <div className="who">
                  <span className="name">{p.name}</span>
                  <span className="sub">{contactLine(p)}</span>
                </div>
                {!p.is_active && <span className="pill pill-warn">Off</span>}
                <span className="pill pill-cold">{p.is_admin ? "Admin" : p.role === "teacher" ? "Teacher" : "Student"}</span>
              </button>
              {openId === p.id && (person ? (
                <PersonPanel
                  person={person}
                  me={auth?.profile?.id}
                  courses={courses}
                  busy={busy}
                  onUpdate={(values, action) => setPending({ values, action })}
                  onGrant={(courseId, days) => act(() => adminApi.grant(courseId, p.id, days), "Access granted.")}
                  onRevoke={(courseId) => act(() => paymentsApi.revoke(courseId, p.id), "Access revoked.")}
                  onGrantPro={(days) => act(() => adminApi.grantPro(p.id, days), "EA Pro given.")}
                  onRevokePro={() => setPending({ action: "revoke pro" })}
                  onPassword={() => setPassword(makeTemporaryPassword())}
                />
              ) : (
                <div className="skeleton" />
              ))}
            </div>
          ))}
          {data.items.length < data.total && (
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => load(data.items.length).catch((err) => setError(friendlyError(err.message)))}>
                Show more
              </button>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={confirmText?.[0]}
        confirmLabel="Confirm"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          const { values, action } = pending;
          if (action === "revoke pro") await act(() => adminApi.revokePro(openId), "EA Pro revoked.");
          else await act(() => adminApi.updatePerson(openId, values), "Saved.");
          setPending(null);
        }}
      >
        <p>{confirmText?.[1]}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={password !== null}
        title="Set a temporary password?"
        confirmLabel="Set password"
        busy={busy}
        onCancel={() => setPassword(null)}
        onConfirm={async () => {
          const chosen = password;
          await act(() => adminApi.setPassword(openId, chosen), `Password set. Tell the student: ${chosen}`);
          setPassword(null);
        }}
      >
        <p>Their old password stops working at once. Tell them this one, and ask them to keep it private.</p>
        <label className="field">
          <span className="label">Temporary password</span>
          <input className="input" value={password ?? ""} onChange={(e) => setPassword(e.target.value)} minLength={8} aria-label="Temporary password" />
        </label>
      </ConfirmDialog>
    </div>
  );
}
