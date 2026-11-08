import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { OwnerCard, PaidStudentsCard, PricingCard } from "../components/studio/PricingCards.jsx";
import { money, tierOf } from "../lib/payments.js";
import { studioApi } from "../lib/studioApi.js";
import {
  MAX_DESCRIPTION_LEN,
  MAX_TITLE_LEN,
  STATUS,
  activityCounts,
  active,
  archivedOnly,
  friendlyError,
  kindLabel,
  moveId,
  outlineCounts,
  publishCheck,
  removedMessage,
  timeAgo,
  trimmed,
} from "../lib/studio.js";
import { ConfirmDialog, ErrorNote, Flash, KindIcon, LeavePrompt, StatusChip } from "../components/studio/Parts.jsx";
import useDirtyMap from "../lib/useDirtyMap.js";
import useUnsavedGuard from "../lib/useUnsavedGuard.js";

// ---- small forms -------------------------------------------------------------------------

// One text box plus an Add button, for "new chapter" and "new lesson".
function AddInline({ label, placeholder, busy, onAdd, dirtyKey, setDirty }) {
  const [value, setValue] = useState("");
  const dirty = trimmed(value) !== "";
  useEffect(() => {
    setDirty(dirtyKey, dirty);
    return () => setDirty(dirtyKey, false);
  }, [dirty, dirtyKey, setDirty]);

  const submit = async (event) => {
    event.preventDefault();
    if (!dirty || busy) return;
    const ok = await onAdd(trimmed(value));
    if (ok) setValue("");
  };

  return (
    <form className="add-inline" onSubmit={submit}>
      <input
        className="input"
        value={value}
        maxLength={MAX_TITLE_LEN}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      <button type="submit" className="btn btn-ghost" disabled={!dirty || busy}>
        <Plus size={16} aria-hidden="true" />
        {label}
      </button>
    </form>
  );
}

// A title that turns into an input when you press the pencil.
function RenameTitle({ title, archived, busy, onSave, dirtyKey, setDirty, link }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const dirty = editing && trimmed(value) !== title;
  useEffect(() => {
    setDirty(dirtyKey, dirty);
    return () => setDirty(dirtyKey, false);
  }, [dirty, dirtyKey, setDirty]);

  if (!editing) {
    return (
      <div className="rename">
        {link ? (
          <Link className="name" to={link}>
            {title}
          </Link>
        ) : (
          <span className="name">{title}</span>
        )}
        {archived && <span className="pill pill-cold">Archived</span>}
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setValue(title);
            setEditing(true);
          }}
          aria-label={`Rename ${title}`}
          disabled={busy}
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  const save = async (event) => {
    event.preventDefault();
    if (!trimmed(value) || busy) return;
    if (trimmed(value) === title) return setEditing(false);
    if (await onSave(trimmed(value))) setEditing(false);
  };
  return (
    <form className="rename" onSubmit={save}>
      <input
        className="input"
        value={value}
        maxLength={MAX_TITLE_LEN}
        onChange={(e) => setValue(e.target.value)}
        aria-label="New title"
        autoFocus
      />
      <button type="submit" className="btn btn-ghost" disabled={busy || !trimmed(value)}>
        Save
      </button>
      <button type="button" className="btn-text" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

function RowActions({ index, count, archived, busy, name, onMove, onArchive, onDelete }) {
  return (
    <div className="row-actions">
      <button type="button" className="icon-btn" onClick={() => onMove("up")} disabled={busy || archived || index === 0} aria-label={`Move ${name} up`}>
        <ArrowUp size={15} />
      </button>
      <button type="button" className="icon-btn" onClick={() => onMove("down")} disabled={busy || archived || index === count - 1} aria-label={`Move ${name} down`}>
        <ArrowDown size={15} />
      </button>
      <button type="button" className="icon-btn" onClick={onArchive} disabled={busy} aria-label={`${archived ? "Restore" : "Archive"} ${name}`} title={archived ? "Restore" : "Archive"}>
        {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
      </button>
      <button type="button" className="icon-btn danger" onClick={onDelete} disabled={busy} aria-label={`Delete ${name}`} title="Delete">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

// ---- course details ---------------------------------------------------------------------------

function DetailsCard({ course, busy, onSave, setDirty }) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const changed = trimmed(title) !== course.title || trimmed(description) !== course.description;
  useEffect(() => {
    setDirty("details", changed);
    return () => setDirty("details", false);
  }, [changed, setDirty]);

  const valid = trimmed(title) !== "" && trimmed(description) !== "";
  const submit = async (event) => {
    event.preventDefault();
    if (!changed || !valid || busy) return;
    await onSave({ title: trimmed(title), description: trimmed(description) });
  };
  const discard = () => {
    setTitle(course.title);
    setDescription(course.description);
  };

  return (
    <form className="card editor-card" onSubmit={submit}>
      <label className="field">
        <span className="label">Course title</span>
        <input className="input" value={title} maxLength={MAX_TITLE_LEN} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">Description</span>
        <textarea className="input" rows={3} value={description} maxLength={MAX_DESCRIPTION_LEN} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="meta-line">
        {course.created_at && <span>Created {timeAgo(course.created_at)}</span>}
        {course.published_at && <span>First published {timeAgo(course.published_at)}</span>}
        {course.updated_at && <span>Updated {timeAgo(course.updated_at)}</span>}
      </div>
      {!valid && <p className="hint">The title and description cannot be empty.</p>}
      <div className="form-actions">
        {changed && (
          <button type="button" className="btn btn-ghost" onClick={discard} disabled={busy}>
            Discard changes
          </button>
        )}
        <button type="submit" className="btn" disabled={!changed || !valid || busy}>
          {busy ? "Saving…" : course.status === "draft" ? "Save draft" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ---- stats (owner only) ------------------------------------------------------------------------

function StatsCard({ courseId }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    studioApi
      .courseStats(courseId)
      .then((data) => live && setStats(data))
      .catch((err) => live && setError(friendlyError(err.message)));
    return () => {
      live = false;
    };
  }, [courseId]);

  if (error) return <ErrorNote message={error} />;
  // Same height as the loaded card, so the page below it does not jump when the numbers arrive.
  if (!stats) return <div className="skeleton stats-skeleton" aria-hidden="true" />;
  return (
    <section className="card stats-card" aria-label="Learner numbers">
      <div>
        <p className="label">Learners</p>
        <p className="stat num">{stats.learners ?? "–"}</p>
      </div>
      <div>
        <p className="label">Finished the course</p>
        <p className="stat num">{stats.completed_course ?? "–"}</p>
      </div>
      <p className="hint stats-note">
        {stats.hidden
          ? `Fewer than ${stats.min_aggregate} learners, so the numbers are hidden to protect them. No names are ever shown here.`
          : "All students on EA, counted without names. Per-class numbers are on the class pages."}
      </p>
    </section>
  );
}

// ---- classes (owner only) ---------------------------------------------------------------------------

// Giving a course to a class puts it on that class's pages, so the teacher sees its students'
// progress there. These numbers are the class's own, separate from the course-wide ones above.
function ClassesCard({ courseId, status, price, currency, tier }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [giving, setGiving] = useState(null);

  useEffect(() => {
    let live = true;
    studioApi
      .courseClasses(courseId)
      .then((data) => live && setRows(data))
      .catch((err) => live && setError(friendlyError(err.message)));
    return () => {
      live = false;
    };
  }, [courseId]);

  const toggle = async (row) => {
    setBusyId(row.class_id);
    setError("");
    try {
      const updated = row.assigned
        ? await studioApi.takeFromClass(courseId, row.class_id)
        : await studioApi.giveToClass(courseId, row.class_id);
      setRows((current) => current.map((r) => (r.class_id === updated.class_id ? updated : r)));
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusyId(null);
    }
  };

  if (error && !rows) return <ErrorNote message={error} />;
  if (!rows) return <div className="skeleton" />;
  return (
    <section className="card classes-card" aria-label="Classes">
      <div className="classes-head">
        <p className="label">Your classes</p>
        <p className="sub">
          {status === "published"
            ? "Everyone on EA can find this course. Give it to a class to follow that class's progress."
            : "Give it to a class to follow that class's progress. Students see it once it is published."}
        </p>
      </div>
      <ErrorNote message={error} />
      {rows.length === 0 && <p className="empty-inline">You do not teach any classes yet.</p>}
      {rows.map((row) => (
        <div className="row" key={row.class_id}>
          <div className="who">
            <span className="name">{row.name}</span>
            <span className="sub">
              {row.assigned
                ? `${row.learners} of ${row.students} student${row.students === 1 ? "" : "s"} started · ${row.completed_course} finished`
                : `${row.students} student${row.students === 1 ? "" : "s"}`}
            </span>
          </div>
          {row.assigned && <Link className="btn btn-ghost btn-small" to={`/classes/${encodeURIComponent(row.class_id)}`}>View class</Link>}
          <button
            type="button"
            className={row.assigned ? "btn btn-ghost btn-small" : "btn btn-small"}
            disabled={busyId === row.class_id}
            onClick={() => (!row.assigned && tier !== "free" ? setGiving(row) : toggle(row))}
          >
            {busyId === row.class_id ? "Saving…" : row.assigned ? "Take back" : "Give to class"}
          </button>
        </div>
      ))}
      <ConfirmDialog
        open={Boolean(giving)}
        title={`Give this ${tier === "pro" ? "Pro" : "paid"} course to ${giving?.name} for free?`}
        confirmLabel="Give for free"
        onCancel={() => setGiving(null)}
        onConfirm={() => {
          const row = giving;
          setGiving(null);
          toggle(row);
        }}
      >
        <p>
          All {giving?.students} student{giving?.students === 1 ? "" : "s"} in this class, and anyone
          who joins later, get this course {tier === "pro" ? "without EA Pro" : `without paying ${money(price, currency)}`}.
        </p>
        <p>If you take it back, they lose it unless they bought it. Their progress stays.</p>
      </ConfirmDialog>
    </section>
  );
}

// ---- the page ---------------------------------------------------------------------------------------

export default function CourseEditor() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const isAdmin = Boolean(auth?.profile?.is_admin);
  const [outline, setOutline] = useState(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, body, label, danger, run }
  const [showArchived, setShowArchived] = useState(false);
  const { dirty, setDirty } = useDirtyMap();
  const { blocker, allowLeave } = useUnsavedGuard(dirty);

  const reload = useCallback(async () => {
    setOutline(await studioApi.getCourse(courseId));
  }, [courseId]);

  useEffect(() => {
    let live = true;
    studioApi
      .getCourse(courseId)
      .then((data) => live && setOutline(data))
      .catch((err) => live && setError(friendlyError(err.message)));
    return () => {
      live = false;
    };
  }, [courseId]);

  // Runs one change, then re-reads the course so the screen always shows what the server holds.
  const run = useCallback(
    async (action, success) => {
      setBusy(true);
      setError("");
      try {
        const result = await action();
        await reload();
        if (success) setFlash(typeof success === "function" ? success(result) : success);
        return true;
      } catch (err) {
        setError(friendlyError(err.message));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const ask = (options) => setConfirm(options);
  const confirmNow = async () => {
    const { run: go } = confirm;
    setBusy(true);
    await go();
    setConfirm(null);
  };

  if (error && !outline) {
    return (
      <div className="studio">
        <Link className="back" to="/studio"><ChevronLeft size={16} /> All courses</Link>
        <ErrorNote message={error} />
      </div>
    );
  }
  if (!outline) {
    return (
      <div className="studio">
        <div className="skeleton tall" />
        <div className="skeleton tall" />
      </div>
    );
  }

  // The main admin manages every course, so they get the owner's controls.
  const owned = outline.owned || isAdmin;
  const modules = outline.modules;
  const liveModules = active(modules);
  const archivedCount =
    archivedOnly(modules).length + modules.reduce((n, m) => n + archivedOnly(m.lessons).length, 0);
  const check = publishCheck(outline);
  const counts = outlineCounts(outline);
  const base = `/studio/courses/${encodeURIComponent(outline.id)}`;

  const moveModule = (id, direction) => {
    const next = moveId(liveModules.map((m) => m.id), id, direction);
    if (next) run(() => studioApi.reorderModules(outline.id, next));
  };
  const moveLesson = (module, id, direction) => {
    const next = moveId(active(module.lessons).map((l) => l.id), id, direction);
    if (next) run(() => studioApi.reorderLessons(module.id, next));
  };

  const askRemove = (noun, name, call) =>
    ask({
      title: `Delete ${noun} “${name}”?`,
      label: "Delete",
      danger: true,
      body: (
        <>
          <p>If no student has progress in it, it is deleted for good along with everything inside it.</p>
          <p>If students do have progress, it is archived instead and their records are kept.</p>
        </>
      ),
      run: () => run(call, (result) => removedMessage(result, noun)),
    });

  const askArchive = (noun, name, isArchived, call) =>
    isArchived
      ? run(call, `The ${noun} is back.`)
      : ask({
          title: `Archive ${noun} “${name}”?`,
          label: "Archive",
          body: <p>Students will no longer see it. Nothing is lost and you can restore it any time.</p>,
          run: () => run(call, `The ${noun} was archived.`),
        });

  const publish = () => {
    if (dirty) return setError("Save or discard your changes first, then publish.");
    if (!check.ok) return setError(check.reason);
    ask({
      title: "Publish this course?",
      label: "Publish",
      body: (
        <p>
          Every student on EA will be able to find “{outline.title}”. You can unpublish it later;
          students who already started keep their access.
        </p>
      ),
      run: () => run(() => studioApi.publishCourse(outline.id), "Published. Students can now find this course."),
    });
  };
  const unpublish = () =>
    ask({
      title: "Unpublish this course?",
      label: "Unpublish",
      body: (
        <p>
          New students will no longer find it. Students who already started it keep their access and
          progress.
        </p>
      ),
      run: () => run(() => studioApi.unpublishCourse(outline.id), "Unpublished. Students who already started keep access."),
    });
  const removeCourse = () =>
    ask({
      title: "Delete this whole course?",
      label: "Delete course",
      danger: true,
      body: (
        <p>
          This removes “{outline.title}”, its chapters, lessons and activities for good. If any
          student has progress in it the server refuses, and you should unpublish it instead.
        </p>
      ),
      run: async () => {
        setBusy(true);
        setError("");
        try {
          await studioApi.deleteCourse(outline.id);
          allowLeave(); // deleted on purpose: nothing left to protect
          navigate("/studio");
        } catch (err) {
          setError(friendlyError(err.message));
        } finally {
          setBusy(false);
        }
      },
    });

  return (
    <div className="studio">
      <LeavePrompt blocker={blocker} />
      <Link className="back" to="/studio">
        <ChevronLeft size={16} /> All courses
      </Link>

      <header className="page-head">
        <div>
          <p className="label">Course editor</p>
          <h1>{outline.title}</h1>
          <p className="status-line">
            <StatusChip status={outline.status} />
            <span className="sub">{STATUS[outline.status]?.help}</span>
          </p>
        </div>
        {owned ? (
          outline.status === "published" ? (
            <button className="btn btn-ghost" onClick={unpublish} disabled={busy}>
              <EyeOff size={17} aria-hidden="true" /> Unpublish
            </button>
          ) : (
            <button className="btn" onClick={publish} disabled={busy || !check.ok} title={check.ok ? "" : check.reason}>
              <Rocket size={17} aria-hidden="true" /> Publish
            </button>
          )
        ) : null}
      </header>

      {!owned && (
        <p className="hint studio-note">
          This course is shared with your class and is always published. You can edit what it
          contains, but it cannot be published, unpublished or deleted here.
        </p>
      )}
      {owned && outline.status !== "published" && !check.ok && <p className="hint studio-note">{check.reason}</p>}

      <Flash message={flash} onClose={() => setFlash("")} />
      <ErrorNote message={error} />

      <DetailsCard
        key={outline.id}
        course={outline}
        busy={busy}
        setDirty={setDirty}
        onSave={(values) => run(() => studioApi.updateCourse(outline.id, values), "Saved.")}
      />

      {owned && (
        <PricingCard
          key={`pricing-${outline.access_tier}-${outline.pro_included}-${outline.price}-${outline.access_days}-${outline.payment_instructions}`}
          course={outline}
          busy={busy}
          setDirty={setDirty}
          onSave={(values) => run(() => studioApi.updateCourse(outline.id, values), "Pricing saved.")}
        />
      )}
      {isAdmin && <OwnerCard key={`owner-${outline.owner_id}`} course={outline} onChanged={reload} />}
      {owned && outline.status !== "draft" && <StatsCard courseId={outline.id} />}
      {owned && (
        <ClassesCard courseId={outline.id} status={outline.status} price={outline.price} currency={outline.currency} tier={tierOf(outline)} />
      )}
      {owned && Boolean(outline.owner_id) && <PaidStudentsCard courseId={outline.id} />}

      <div className="section-bar">
        <div>
          <p className="label">Chapters and lessons</p>
          <p className="sub">
            {counts.chapters} chapter{counts.chapters === 1 ? "" : "s"} · {counts.lessons} lesson
            {counts.lessons === 1 ? "" : "s"}
          </p>
        </div>
        {archivedCount > 0 && (
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived ({archivedCount})
          </label>
        )}
      </div>

      {liveModules.length === 0 && !showArchived && (
        <section className="empty">
          <p className="empty-title">No chapters yet</p>
          <p>A chapter groups lessons. Add your first one below.</p>
        </section>
      )}

      {modules
        .filter((m) => showArchived || !m.archived)
        .map((module) => {
          const liveIndex = liveModules.findIndex((m) => m.id === module.id);
          const lessons = module.lessons.filter((l) => showArchived || !l.archived);
          const liveLessons = active(module.lessons);
          return (
            <section className={`card chapter${module.archived ? " row-dim" : ""}`} key={module.id}>
              <div className="chapter-head">
                <RenameTitle
                  title={module.title}
                  archived={module.archived}
                  busy={busy}
                  dirtyKey={`rename-${module.id}`}
                  setDirty={setDirty}
                  onSave={(title) => run(() => studioApi.updateModule(module.id, { title }), "Chapter renamed.")}
                />
                <RowActions
                  name={`chapter ${module.title}`}
                  index={liveIndex}
                  count={liveModules.length}
                  archived={module.archived}
                  busy={busy}
                  onMove={(d) => moveModule(module.id, d)}
                  onArchive={() => askArchive("chapter", module.title, module.archived, () => studioApi.updateModule(module.id, { archived: !module.archived }))}
                  onDelete={() => askRemove("chapter", module.title, () => studioApi.deleteModule(module.id))}
                />
              </div>

              {lessons.length === 0 && <p className="empty-inline">No lessons in this chapter yet.</p>}
              {lessons.map((lesson) => {
                const lessonCounts = activityCounts(lesson);
                return (
                  <div className={`row lesson-row${lesson.archived ? " row-dim" : ""}`} key={lesson.id}>
                    <div className="who">
                      <RenameTitle
                        title={lesson.title}
                        archived={lesson.archived}
                        busy={busy}
                        link={`${base}/lessons/${encodeURIComponent(lesson.id)}`}
                        dirtyKey={`rename-${lesson.id}`}
                        setDirty={setDirty}
                        onSave={(title) => run(() => studioApi.updateLesson(lesson.id, { title }), "Lesson renamed.")}
                      />
                      <div className="chips">
                        {Object.keys(lessonCounts).length === 0 && <span className="sub">No activities yet</span>}
                        {Object.entries(lessonCounts).map(([kind, n]) => (
                          <span className="pill" key={kind} title={kindLabel(kind)}>
                            <KindIcon kind={kind} size={13} />
                            {n > 1 ? `${kindLabel(kind)} ×${n}` : kindLabel(kind)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Link className="btn btn-ghost btn-small" to={`${base}/lessons/${encodeURIComponent(lesson.id)}`}>
                      Activities
                    </Link>
                    <RowActions
                      name={`lesson ${lesson.title}`}
                      index={liveLessons.findIndex((l) => l.id === lesson.id)}
                      count={liveLessons.length}
                      archived={lesson.archived}
                      busy={busy}
                      onMove={(d) => moveLesson(module, lesson.id, d)}
                      onArchive={() => askArchive("lesson", lesson.title, lesson.archived, () => studioApi.updateLesson(lesson.id, { archived: !lesson.archived }))}
                      onDelete={() => askRemove("lesson", lesson.title, () => studioApi.deleteLesson(lesson.id))}
                    />
                  </div>
                );
              })}

              {!module.archived && (
                <div className="chapter-foot">
                  <AddInline
                    label="Add lesson"
                    placeholder="New lesson title"
                    busy={busy}
                    dirtyKey={`add-lesson-${module.id}`}
                    setDirty={setDirty}
                    onAdd={(title) => run(() => studioApi.createLesson(module.id, { title }), "Lesson added.")}
                  />
                </div>
              )}
            </section>
          );
        })}

      <div className="card add-chapter">
        <AddInline
          label="Add chapter"
          placeholder="New chapter title, for example “Greetings”"
          busy={busy}
          dirtyKey="add-chapter"
          setDirty={setDirty}
          onAdd={(title) => run(() => studioApi.createModule(outline.id, { title }), "Chapter added.")}
        />
      </div>

      {owned && (
        <section className="danger-zone">
          <div>
            <p className="name">Delete this course</p>
            <p className="sub">Only possible while no student has progress in it. Otherwise unpublish it.</p>
          </div>
          <button className="btn btn-danger btn-small" onClick={removeCourse} disabled={busy}>
            <Trash2 size={15} aria-hidden="true" /> Delete course
          </button>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
        busy={busy}
        onConfirm={confirmNow}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.body}
      </ConfirmDialog>
    </div>
  );
}
