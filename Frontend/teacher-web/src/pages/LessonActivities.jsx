import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ExternalLink,
  Pencil,
  Plus,
} from "lucide-react";
import { studioApi } from "../lib/studioApi.js";
import {
  KINDS,
  active,
  archivedOnly,
  friendlyError,
  kindLabel,
  kindTaken,
  moveId,
  parseYouTube,
} from "../lib/studio.js";
import ActivityForm from "../components/studio/ActivityForm.jsx";
import { ConfirmDialog, ErrorNote, Flash, KindIcon, LeavePrompt } from "../components/studio/Parts.jsx";
import useDirtyMap from "../lib/useDirtyMap.js";
import useUnsavedGuard from "../lib/useUnsavedGuard.js";

// Where a quiz or practice is edited: the existing editors, unchanged.
const questionEditor = (lessonId, kind) =>
  `/content/lessons/${encodeURIComponent(lessonId)}/${kind === "quiz" ? "quiz" : "practice"}`;

function ActivitySummary({ activity, lessonId }) {
  if (activity.kind === "video") {
    const parsed = parseYouTube(activity.video_url);
    return (
      <a className="hint link-inline" href={activity.video_url} target="_blank" rel="noreferrer">
        {parsed.ok ? "Open in YouTube" : activity.video_url} <ExternalLink size={13} aria-hidden="true" />
      </a>
    );
  }
  if (activity.kind === "reading") {
    const text = (activity.reading_body ?? "").trim();
    return <p className="hint clamp">{text.length > 160 ? `${text.slice(0, 160)}…` : text}</p>;
  }
  return (
    <Link className="pill pill-link" to={questionEditor(lessonId, activity.kind)}>
      <KindIcon kind={activity.kind} size={13} />
      {activity.kind === "quiz" ? "Edit quiz questions" : "Edit practice items"}
    </Link>
  );
}

export default function LessonActivities() {
  const { courseId, lessonId } = useParams();
  const [lesson, setLesson] = useState(null); // { title, chapter, courseTitle }
  const [activities, setActivities] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(null); // a kind, while its form is open
  const [editingId, setEditingId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const { dirty, setDirty } = useDirtyMap();
  const { blocker } = useUnsavedGuard(dirty);

  const refresh = useCallback(async () => {
    setActivities(await studioApi.listActivities(lessonId));
  }, [lessonId]);

  useEffect(() => {
    let live = true;
    // The course outline names the lesson and its chapter; there is no single-lesson route.
    Promise.all([studioApi.getCourse(courseId), studioApi.listActivities(lessonId)])
      .then(([outline, list]) => {
        if (!live) return;
        for (const module of outline.modules) {
          const found = module.lessons.find((l) => l.id === lessonId);
          if (found) setLesson({ title: found.title, chapter: module.title, courseTitle: outline.title });
        }
        setActivities(list);
      })
      .catch((err) => live && setError(friendlyError(err.message)));
    return () => {
      live = false;
    };
  }, [courseId, lessonId]);

  const run = useCallback(
    async (action, success) => {
      setBusy(true);
      setError("");
      try {
        await action();
        await refresh();
        if (success) setFlash(success);
        return true;
      } catch (err) {
        setError(friendlyError(err.message));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const back = `/studio/courses/${encodeURIComponent(courseId)}`;

  if (!activities || (!lesson && !error)) {
    return (
      <div className="studio">
        <Link className="back" to={back}><ChevronLeft size={16} /> Back to course</Link>
        {error ? <ErrorNote message={error} /> : (<><div className="skeleton tall" /><div className="skeleton tall" /></>)}
      </div>
    );
  }

  const live = active(activities);
  const archived = archivedOnly(activities);

  const create = async (kind, values) => {
    // Throws on failure so the form can show the message and stay open.
    setBusy(true);
    try {
      await studioApi.createActivity(lessonId, { kind, ...values });
      await refresh();
      setAdding(null);
      setFlash(`${kindLabel(kind)} added.`);
    } finally {
      setBusy(false);
    }
  };
  const save = async (activity, values) => {
    setBusy(true);
    try {
      await studioApi.updateActivity(activity.id, values);
      await refresh();
      setEditingId(null);
      setFlash("Saved.");
    } finally {
      setBusy(false);
    }
  };
  const move = (id, direction) => {
    const next = moveId(live.map((a) => a.id), id, direction);
    if (next) run(() => studioApi.reorderActivities(lessonId, next));
  };
  const archive = (activity) =>
    setConfirm({
      title: `Archive “${activity.title}”?`,
      body: (
        <p>
          Students will no longer see it, and anyone who completed it keeps that progress. You can
          restore it from the archived list.
        </p>
      ),
      run: () => run(() => studioApi.updateActivity(activity.id, { archived: true }), "Archived."),
    });
  const confirmNow = async () => {
    setBusy(true);
    await confirm.run();
    setConfirm(null);
  };

  const openAdd = (kind) => {
    if (dirty && !window.confirm("Discard what you typed?")) return;
    setEditingId(null);
    setAdding(kind);
  };

  return (
    <div className="studio">
      <LeavePrompt blocker={blocker} />
      <Link className="back" to={back}>
        <ChevronLeft size={16} /> {lesson?.courseTitle ?? "Back to course"}
      </Link>
      <header className="page-head">
        <div>
          <p className="label">{lesson?.chapter ?? "Lesson"}</p>
          <h1>{lesson?.title ?? "Lesson"}</h1>
          <p className="sub">Activities appear to students in this order.</p>
        </div>
      </header>

      <Flash message={flash} onClose={() => setFlash("")} />
      <ErrorNote message={error} />

      {live.length === 0 && !adding && (
        <section className="empty">
          <p className="empty-title">No activities yet</p>
          <p>Add a video, a quiz, a practice or a reading. You can put them in any order.</p>
        </section>
      )}

      <ol className="activity-list">
        {live.map((activity, index) =>
          editingId === activity.id ? (
            <li key={activity.id}>
              <ActivityForm
                kind={activity.kind}
                initial={activity}
                dirtyKey={`edit-${activity.id}`}
                setDirty={setDirty}
                onSubmit={(values) => save(activity, values)}
                onCancel={() => {
                  if (dirty && !window.confirm("Discard your changes to this activity?")) return;
                  setEditingId(null);
                }}
              />
            </li>
          ) : (
            <li className="card activity" key={activity.id}>
              <span className="act-num num">{index + 1}</span>
              <div className="act-main">
                <div className="act-title">
                  <KindIcon kind={activity.kind} />
                  <span className="name">{activity.title}</span>
                  <span className="pill pill-cold">{kindLabel(activity.kind)}</span>
                  {activity.is_required && <span className="pill">Required</span>}
                </div>
                <ActivitySummary activity={activity} lessonId={lessonId} />
              </div>
              <div className="row-actions">
                <button type="button" className="icon-btn" onClick={() => move(activity.id, "up")} disabled={busy || index === 0} aria-label={`Move ${activity.title} up`}>
                  <ArrowUp size={15} />
                </button>
                <button type="button" className="icon-btn" onClick={() => move(activity.id, "down")} disabled={busy || index === live.length - 1} aria-label={`Move ${activity.title} down`}>
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => {
                    if (dirty && !window.confirm("Discard what you typed?")) return;
                    setAdding(null);
                    setEditingId(activity.id);
                  }}
                  disabled={busy}
                  aria-label={`Edit ${activity.title}`}
                >
                  <Pencil size={15} />
                </button>
                <button type="button" className="icon-btn" onClick={() => archive(activity)} disabled={busy} aria-label={`Archive ${activity.title}`} title="Archive">
                  <Archive size={15} />
                </button>
              </div>
            </li>
          ),
        )}
      </ol>

      {adding ? (
        <ActivityForm
          kind={adding}
          dirtyKey="add"
          setDirty={setDirty}
          onSubmit={(values) => create(adding, values)}
          onCancel={() => {
            if (dirty && !window.confirm("Discard what you typed?")) return;
            setAdding(null);
          }}
        />
      ) : (
        <section className="card add-activity" aria-label="Add an activity">
          <p className="label">Add an activity</p>
          <div className="kind-grid">
            {KINDS.map((k) => {
              const taken = kindTaken(activities, k.kind);
              return (
                <button
                  key={k.kind}
                  type="button"
                  className="kind-btn"
                  onClick={() => openAdd(k.kind)}
                  disabled={busy || taken}
                >
                  <KindIcon kind={k.kind} size={20} />
                  <span className="name">
                    <Plus size={13} aria-hidden="true" /> {k.label}
                  </span>
                  <span className="sub">
                    {taken ? `This lesson already has a ${k.kind}` : k.help}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <details className="archived">
          <summary>Archived ({archived.length})</summary>
          {archived.map((activity) => (
            <div className="row row-dim" key={activity.id}>
              <KindIcon kind={activity.kind} />
              <div className="who">
                <span className="name">{activity.title}</span>
                <span className="sub">{kindLabel(activity.kind)}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={busy}
                onClick={() => run(() => studioApi.updateActivity(activity.id, { archived: false }), "Restored.")}
              >
                <ArchiveRestore size={15} aria-hidden="true" /> Restore
              </button>
            </div>
          ))}
        </details>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        confirmLabel="Archive"
        busy={busy}
        onConfirm={confirmNow}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.body}
      </ConfirmDialog>
    </div>
  );
}
