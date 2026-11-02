import { useEffect, useRef } from "react";
import { Dumbbell, FileText, ListChecks, Video } from "lucide-react";
import { STATUS } from "../../lib/studio.js";

const ICONS = { video: Video, quiz: ListChecks, practice: Dumbbell, reading: FileText };

export function KindIcon({ kind, size = 16 }) {
  const Icon = ICONS[kind] ?? FileText;
  return <Icon size={size} aria-hidden="true" />;
}

// Status is shown with a word as well as a colour, so it never depends on colour alone.
export function StatusChip({ status }) {
  const meta = STATUS[status] ?? { label: status };
  return <span className={`status-chip status-${status}`}>{meta.label}</span>;
}

// A modal confirmation using the native <dialog>. Escape or Cancel closes it.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      {open && (
        <div className="confirm-body">
          <h2 id="confirm-title">{title}</h2>
          <div className="confirm-text">{children}</div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={danger ? "btn btn-danger" : "btn"}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

// Shown when the router has blocked a navigation because of unsaved changes.
// Staying keeps everything as typed; leaving discards it on purpose.
export function LeavePrompt({ blocker }) {
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="You have unsaved changes"
      confirmLabel="Leave and discard"
      cancelLabel="Stay on this page"
      danger
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      <p>If you leave now, what you typed on this page will be lost.</p>
    </ConfirmDialog>
  );
}

export function Flash({ message, onClose }) {
  if (!message) return null;
  return (
    <p className="flash" role="status">
      <span>{message}</span>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss message">
        ×
      </button>
    </p>
  );
}

// An error is announced to screen readers and scrolled into view, because the action that
// failed may be far down the page from where the message appears.
export function ErrorNote({ message }) {
  const ref = useRef(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [message]);
  if (!message) return null;
  return (
    <p className="notice" role="alert" ref={ref}>
      {message}
    </p>
  );
}
