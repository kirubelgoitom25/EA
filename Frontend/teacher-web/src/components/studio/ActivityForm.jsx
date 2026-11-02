import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  MAX_READING_LEN,
  MAX_TITLE_LEN,
  friendlyError,
  kindLabel,
  parseYouTube,
  trimmed,
} from "../../lib/studio.js";
import { ErrorNote, KindIcon } from "./Parts.jsx";

const TITLE_HINT = {
  video: "Video",
  quiz: "Quiz",
  practice: "Practice",
  reading: "Reading",
};

// Create or edit one activity. `initial` is the saved activity when editing.
// onSubmit gets only what the server accepts for this kind. Nothing is sent until Save.
export default function ActivityForm({ kind, initial, onSubmit, onCancel, setDirty, dirtyKey }) {
  const editing = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [required, setRequired] = useState(initial?.is_required ?? false); // never required unless chosen
  const [videoUrl, setVideoUrl] = useState(initial?.video_url ?? "");
  const [body, setBody] = useState(initial?.reading_body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const saved = {
    title: initial?.title ?? "",
    required: initial?.is_required ?? false,
    video: initial?.video_url ?? "",
    body: initial?.reading_body ?? "",
  };
  const dirty =
    trimmed(title) !== saved.title ||
    required !== saved.required ||
    (kind === "video" && trimmed(videoUrl) !== saved.video) ||
    (kind === "reading" && body !== saved.body);

  useEffect(() => {
    setDirty(dirtyKey, dirty);
    return () => setDirty(dirtyKey, false);
  }, [dirty, dirtyKey, setDirty]);

  const youtube = kind === "video" ? parseYouTube(videoUrl) : null;
  const needsTitle = editing && trimmed(title) === "";
  const contentMissing =
    (kind === "video" && !youtube.ok) || (kind === "reading" && trimmed(body) === "");

  const submit = async (event) => {
    event.preventDefault();
    if (busy || needsTitle || contentMissing) return;
    const values = {};
    if (trimmed(title) !== saved.title && (editing || trimmed(title))) values.title = trimmed(title);
    if (required !== saved.required || !editing) values.is_required = required;
    if (kind === "video" && (!editing || trimmed(videoUrl) !== saved.video)) values.video_url = trimmed(videoUrl);
    if (kind === "reading" && (!editing || body !== saved.body)) values.reading_body = body;
    setBusy(true);
    setError("");
    try {
      await onSubmit(values);
    } catch (err) {
      setError(friendlyError(err.message));
      setBusy(false);
    }
  };

  return (
    <form className="card editor-card activity-form" onSubmit={submit}>
      <p className="form-title">
        <KindIcon kind={kind} />
        {editing ? `Edit ${kindLabel(kind).toLowerCase()}` : `New ${kindLabel(kind).toLowerCase()}`}
      </p>

      <label className="field">
        <span className="label">Title{editing ? "" : " (optional)"}</span>
        <input
          className="input"
          value={title}
          maxLength={MAX_TITLE_LEN}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={TITLE_HINT[kind]}
        />
      </label>

      {kind === "video" && (
        <label className="field">
          <span className="label">YouTube link</span>
          <input
            className="input"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            inputMode="url"
            aria-invalid={trimmed(videoUrl) !== "" && !youtube.ok}
          />
          {trimmed(videoUrl) !== "" && !youtube.ok && <span className="hint field-error">{youtube.message}</span>}
          {youtube.ok && (
            <a className="hint link-inline" href={youtube.url} target="_blank" rel="noreferrer">
              Check the video on YouTube <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
        </label>
      )}

      {kind === "reading" && (
        <label className="field">
          <span className="label">Reading text</span>
          <textarea
            className="input reading-box"
            rows={10}
            value={body}
            maxLength={MAX_READING_LEN}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write or paste the text students will read. Blank lines start a new paragraph."
          />
          <span className="hint counter num">
            {body.length.toLocaleString("en-US")} / {MAX_READING_LEN.toLocaleString("en-US")}
          </span>
        </label>
      )}

      {(kind === "quiz" || kind === "practice") && (
        <p className="hint">
          {editing
            ? "Questions are edited in the question editor."
            : "This creates the lesson’s " + kind + ". You add its questions next."}
        </p>
      )}

      <label className="check">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <span>
          Mark as required
          <span className="hint check-hint">
            A label for students. It never stops them from finishing the lesson.
          </span>
        </span>
      </label>

      <ErrorNote message={error} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={busy || needsTitle || contentMissing || (editing && !dirty)}>
          {busy ? "Saving…" : editing ? "Save changes" : `Add ${kindLabel(kind).toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
