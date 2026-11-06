import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { money } from "../lib/payments.js";
import { studioApi } from "../lib/studioApi.js";
import { STATUS, MAX_DESCRIPTION_LEN, MAX_TITLE_LEN, friendlyError, timeAgo, trimmed } from "../lib/studio.js";
import { ErrorNote, LeavePrompt, StatusChip } from "../components/studio/Parts.jsx";
import { Tabs } from "../components/ui.jsx";
import useDirtyMap from "../lib/useDirtyMap.js";
import useUnsavedGuard from "../lib/useUnsavedGuard.js";

function CreateCourse({ onCancel, onDirtyChange, allowLeave }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty = trimmed(title) !== "" || trimmed(description) !== "";
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!trimmed(title) || !trimmed(description)) {
      setError("Give the course a title and a short description.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const course = await studioApi.createCourse({ title, description });
      allowLeave(); // saved: this navigation is deliberate
      onDirtyChange(false);
      navigate(`/studio/courses/${encodeURIComponent(course.id)}`);
    } catch (err) {
      setError(friendlyError(err.message));
      setBusy(false);
    }
  };

  return (
    <form className="card editor-card" onSubmit={submit}>
      <label className="field">
        <span className="label">Course title</span>
        <input
          className="input"
          value={title}
          maxLength={MAX_TITLE_LEN}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="For example: Everyday English"
          autoFocus
        />
      </label>
      <label className="field">
        <span className="label">Description</span>
        <textarea
          className="input"
          rows={3}
          value={description}
          maxLength={MAX_DESCRIPTION_LEN}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What will students learn?"
        />
      </label>
      <p className="hint">It starts as a draft. Only you can see it until you publish it.</p>
      <ErrorNote message={error} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Creating…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

export function CourseCard({ course, admin = false }) {
  const meta = STATUS[course.status];
  const when = course.status === "published" ? course.published_at : course.updated_at;
  const label = course.status === "published" ? "Published" : "Updated";
  const body = (
    <>
      <div className="course-tile-top">
        <StatusChip status={course.status} />
        {!course.owned && !admin && <span className="pill pill-cold">Class course</span>}
        {Number(course.price) > 0 && <span className="pill pill-cold">{money(course.price, course.currency)}</span>}
      </div>
      <h3>{course.title}</h3>
      <p className="course-tile-desc">{course.description}</p>
      <div className="course-tile-foot">
        <span className="sub" title={meta?.help}>
          {course.editable
            ? timeAgo(when)
              ? `${label} ${timeAgo(when)}`
              : meta?.help
            : "Owned by another teacher. View only."}
        </span>
        {course.editable && <ChevronRight size={18} aria-hidden="true" />}
      </div>
    </>
  );
  // Only courses the server says you can edit open the editor; it would answer 404 otherwise.
  if (!course.editable) return <div className="card course-tile course-tile-static">{body}</div>;
  return (
    <Link className="card course-tile" to={`/studio/courses/${encodeURIComponent(course.id)}`}>
      {body}
    </Link>
  );
}

export default function StudioDashboard() {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const auth = useAuth();
  const isAdmin = Boolean(auth?.profile?.is_admin);
  const [creating, setCreating] = useState(false);
  const { dirty, setDirty } = useDirtyMap();
  const onDirtyChange = useCallback((value) => setDirty("create", value), [setDirty]);
  const { blocker, allowLeave } = useUnsavedGuard(dirty);

  useEffect(() => {
    let live = true;
    studioApi
      .listCourses()
      .then((data) => live && setCourses(data))
      .catch((err) => live && setError(friendlyError(err.message)));
    return () => {
      live = false;
    };
  }, []);

  // The main admin manages every course, so they are all listed as their own.
  const owned = (courses ?? []).filter((c) => c.owned || isAdmin);
  const classCourses = (courses ?? []).filter((c) => !c.owned && !isAdmin);
  const count = (status) => owned.filter((c) => c.status === status).length;
  const shown = tab === "all" ? owned : owned.filter((c) => c.status === tab);

  const startCreate = () => setCreating(true);
  const cancelCreate = () => {
    if (dirty && !window.confirm("Discard this new course?")) return;
    setCreating(false);
  };

  return (
    <div className="studio">
      <LeavePrompt blocker={blocker} />
      <header className="page-head">
        <div>
          <p className="label">Course Studio</p>
          <h1>Your courses</h1>
        </div>
        {!creating && (
          <button className="btn" onClick={startCreate} disabled={courses === null && !error}>
            <Plus size={18} aria-hidden="true" />
            New course
          </button>
        )}
      </header>

      {creating && <CreateCourse onCancel={cancelCreate} onDirtyChange={onDirtyChange} allowLeave={allowLeave} />}
      <ErrorNote message={error} />

      {!error && courses === null && (
        <div className="studio-grid">
          <div className="skeleton tall" />
          <div className="skeleton tall" />
          <div className="skeleton tall" />
        </div>
      )}

      {courses && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "all", label: `All ${owned.length}` },
              { key: "draft", label: `Draft ${count("draft")}` },
              { key: "published", label: `Published ${count("published")}` },
              { key: "unpublished", label: `Unpublished ${count("unpublished")}` },
            ]}
          />

          {owned.length === 0 && !creating && (
            <section className="empty">
              <p className="empty-title">You have not created a course yet</p>
              <p>Create one, add chapters and lessons, then publish it for students.</p>
            </section>
          )}
          {owned.length > 0 && shown.length === 0 && (
            <section className="empty">
              <p className="empty-title">Nothing here</p>
              <p>None of your courses are {STATUS[tab]?.label.toLowerCase()}.</p>
            </section>
          )}
          <div className="studio-grid">
            {shown.map((course) => (
              <CourseCard key={course.id} course={course} admin={isAdmin} />
            ))}
          </div>

          {classCourses.length > 0 && (
            <>
              <p className="section-label label">Courses given to your classes</p>
              <p className="hint studio-note">
                These are shared with your class and are always published. You can edit what they
                contain, but not publish or unpublish them.
              </p>
              <div className="studio-grid">
                {classCourses.map((course) => (
                  <CourseCard key={course.id} course={course} admin={isAdmin} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
