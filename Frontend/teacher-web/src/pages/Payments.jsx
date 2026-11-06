import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { ConfirmDialog, ErrorNote, Flash } from "../components/studio/Parts.jsx";
import { Tabs } from "../components/ui.jsx";
import { MAX_NOTE_LEN, durationLabel, formatDate, money, reviewWarnings } from "../lib/payments.js";
import { adminApi, paymentsApi } from "../lib/paymentsApi.js";
import { friendlyError, timeAgo } from "../lib/studio.js";
import { studioApi } from "../lib/studioApi.js";

const PAGE = 50;
const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];
export const PAYMENTS_CHANGED = "ea:payments-changed";

// The image needs the login token, so it is fetched, not linked. It never gets a public address.
function ProofImage({ id }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let made = null;
    paymentsApi
      .proof(id)
      .then((blob) => {
        if (!live) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);

  if (failed) return <p className="hint">This image could not be loaded. Try again in a moment.</p>;
  if (!url) return <div className="skeleton tall" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="proof-image" src={url} alt="Payment screenshot sent by the student" />
    </a>
  );
}

export function RequestDetail({ item, busy, onApprove, onReject }) {
  const [note, setNote] = useState("");
  const pending = item.status === "pending";
  const warnings = reviewWarnings(item);

  return (
    <div className="request-detail">
      <ProofImage id={item.id} />
      <div className="request-side">
        <dl className="facts">
          <dt>Student</dt>
          <dd>{item.student.name}<br /><span className="sub">{item.student.email}</span></dd>
          <dt>Course</dt>
          <dd>{item.course.title}</dd>
          <dt>Amount</dt>
          <dd>{money(item.amount, item.currency)}</dd>
          <dt>Access</dt>
          <dd>{durationLabel(item.access_days)}</dd>
          <dt>Sent</dt>
          <dd>{formatDate(item.created_at)}</dd>
          {item.reviewed_at && (
            <>
              <dt>Decided</dt>
              <dd>{formatDate(item.reviewed_at)}{item.reviewed_by_name ? ` by ${item.reviewed_by_name}` : ""}</dd>
            </>
          )}
          {item.review_note && (
            <>
              <dt>Reason</dt>
              <dd>{item.review_note}</dd>
            </>
          )}
        </dl>

        {pending && (
          <>
            <p className="notice">Check your own account for this money first. A screenshot can be faked.</p>
            {warnings.map((text) => (
              <p className="hint" key={text}>{text}</p>
            ))}
            <label className="field">
              <span className="label">Reason, if you reject (optional)</span>
              <textarea className="input" rows={2} value={note} maxLength={MAX_NOTE_LEN} onChange={(e) => setNote(e.target.value)} placeholder="For example: the amount doesn't match." />
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => onReject(item, note.trim())} disabled={busy}>
                Reject
              </button>
              <button type="button" className="btn" onClick={() => onApprove(item)} disabled={busy}>
                Approve
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RequestRow({ item, open, onToggle, children }) {
  return (
    <div className="request">
      <button type="button" className="row request-head" onClick={() => onToggle(item.id)} aria-expanded={open}>
        <div className="who">
          <span className="name">{item.student.name}</span>
          <span className="sub">{item.course.title} · {money(item.amount, item.currency)} · {durationLabel(item.access_days)}</span>
        </div>
        <span className="sub">{timeAgo(item.created_at)}</span>
        {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>
      {open && children}
    </div>
  );
}

export default function Payments() {
  const auth = useAuth();
  const isAdmin = Boolean(auth?.profile?.is_admin);
  const [status, setStatus] = useState("pending");
  const [courseId, setCourseId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [approving, setApproving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const load = useCallback(
    async (offset = 0) => {
      const page = await paymentsApi.listRequests({
        status,
        course_id: courseId,
        teacher_id: teacherId,
        limit: PAGE,
        offset,
      });
      setData((current) => (offset ? { ...page, items: [...current.items, ...page.items] } : page));
    },
    [status, courseId, teacherId],
  );

  useEffect(() => {
    setData(null);
    setOpenId(null);
    setError("");
    load().catch((err) => setError(friendlyError(err.message)));
  }, [load]);

  useEffect(() => {
    studioApi.listCourses().then(setCourses).catch(() => {});
    if (isAdmin) adminApi.people({ role: "teacher", limit: 200 }).then((d) => setTeachers(d.items)).catch(() => {});
  }, [isAdmin]);

  const act = async (work, message) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setFlash(message);
      setOpenId(null);
      window.dispatchEvent(new Event(PAYMENTS_CHANGED));
    } catch (err) {
      setError(friendlyError(err.message));
    }
    // Someone else may have decided it first, so the list is always read again.
    await load().catch(() => {});
    setBusy(false);
  };

  const approve = async () => {
    const item = approving;
    await act(() => paymentsApi.approve(item.id), `Approved. ${item.student.name} now has access.`);
    setApproving(null);
  };
  const reject = (item, note) => act(() => paymentsApi.reject(item.id, note), "Rejected. The student can send another request.");

  const after = approving?.after_approval;
  return (
    <div className="studio">
      <header className="page-head">
        <div>
          <p className="label">Payments</p>
          <h1>Payment requests</h1>
          <p className="sub">
            {isAdmin ? "Every request on EA." : "Requests for your courses."}
            {data ? ` ${data.pending_total} waiting.` : ""}
          </p>
        </div>
      </header>

      <Flash message={flash} onClose={() => setFlash("")} />
      <ErrorNote message={error} />

      <Tabs tabs={STATUS_TABS} value={status} onChange={setStatus} />

      <div className="filter-row">
        <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Filter by course">
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        {isAdmin && (
          <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label="Filter by teacher">
            <option value="">All teachers</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {!data && !error && <div className="skeleton tall" />}
      {data && (
        <section className="card" aria-label={`${status} requests`}>
          {data.items.length === 0 && <p className="empty-inline">No {status} requests.</p>}
          {data.items.map((item) => (
            <RequestRow key={item.id} item={item} open={openId === item.id} onToggle={(id) => setOpenId(openId === id ? null : id)}>
              <RequestDetail item={item} busy={busy} onApprove={setApproving} onReject={reject} />
            </RequestRow>
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
        open={Boolean(approving)}
        title={`Approve ${approving?.student.name}'s payment?`}
        confirmLabel="Approve"
        busy={busy}
        onCancel={() => setApproving(null)}
        onConfirm={approve}
      >
        <p>
          {after?.permanent
            ? `They get permanent access to ${approving?.course.title}.`
            : `They get ${approving?.course.title} until ${formatDate(after?.expires_at)}.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}
