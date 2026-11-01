import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ClipboardPaste,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api.js";
import OptionRows, { LETTERS } from "../components/OptionRows.jsx";

const PASTE_EXAMPLE = `1. What is 2+2?
a. 3
b. 4
c. 5
Answer: b
Explanation: Add the two numbers.

2. Capital of Ethiopia?
a. Addis Ababa
b. Nairobi
Answer: a`;

function QuestionForm({ initial, submitLabel, onSubmit, onCancel, onDirty }) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [options, setOptions] = useState(initial?.options ?? ["", ""]);
  const [correct, setCorrect] = useState(initial?.correct_index ?? 0);
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const touch = (setter) => (value) => {
    onDirty();
    setter(value);
  };

  const setOption = (index, value) => {
    onDirty();
    setOptions(options.map((o, i) => (i === index ? value : o)));
  };

  const addOption = () => {
    onDirty();
    setOptions([...options, ""]);
  };

  const removeOption = (index) => {
    onDirty();
    setOptions(options.filter((_, i) => i !== index));
    if (index < correct) setCorrect(correct - 1);
    else if (index === correct) setCorrect(0);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        question,
        options,
        correct_index: correct,
        explanation: explanation.trim() ? explanation : null,
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card editor-card" onSubmit={submit}>
      <label className="field">
        <span className="label">Question</span>
        <textarea
          className="input"
          rows={2}
          value={question}
          onChange={(e) => touch(setQuestion)(e.target.value)}
          placeholder="Type the question"
          maxLength={1000}
        />
      </label>

      <OptionRows
        options={options}
        correct={correct}
        onChangeOption={setOption}
        onPickCorrect={touch(setCorrect)}
        onAdd={addOption}
        onRemove={removeOption}
      />

      <label className="field">
        <span className="label">Explanation (optional)</span>
        <textarea
          className="input"
          rows={2}
          value={explanation}
          onChange={(e) => touch(setExplanation)(e.target.value)}
          placeholder="Shown to the student after they answer"
          maxLength={2000}
        />
      </label>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function PastePanel({ used, max, onSaved, onCancel, onDirty, lessonId }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const base = `/teacher/lessons/${encodeURIComponent(lessonId)}/quiz`;

  const runPreview = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await api.post(`${base}/parse`, { text }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // The server checks everything again, the preview is not trusted.
      await api.post(`${base}/bulk`, {
        questions: preview.questions.map((q) => ({
          question: q.question,
          options: q.options,
          correct_index: q.correct_index,
          explanation: q.explanation,
        })),
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const tooMany = preview && used + preview.questions.length > max;
  const canConfirm =
    preview && preview.errors.length === 0 && preview.questions.length > 0 && !tooMany;

  return (
    <section className="card editor-card">
      <p className="label">Paste questions</p>
      <p className="hint">
        Number each question. Give the options as a, b, c and add an
        &quot;Answer:&quot; line. Nothing is saved until you confirm.
      </p>
      <pre className="example">{PASTE_EXAMPLE}</pre>

      <textarea
        className="input paste-box"
        rows={10}
        value={text}
        onChange={(e) => {
          onDirty();
          setText(e.target.value);
          setPreview(null);
        }}
        placeholder="Paste your questions here"
      />

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {preview && preview.errors.length > 0 && (
        <div className="notice" role="alert">
          <strong>Fix these, then preview again:</strong>
          <ul>
            {preview.errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {tooMany && (
        <p className="notice" role="alert">
          That is {preview.questions.length} questions and the quiz already has {used}.
          A quiz can have at most {max}.
        </p>
      )}

      {preview && preview.questions.length > 0 && (
        <div className="preview">
          <p className="label">
            {preview.questions.length} question
            {preview.questions.length === 1 ? "" : "s"} found
          </p>
          {preview.questions.map((q) => (
            <QuestionBody key={q.number} q={q} />
          ))}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={runPreview}
          disabled={busy || !text.trim()}
        >
          Preview
        </button>
        <button type="button" className="btn" onClick={confirm} disabled={busy || !canConfirm}>
          {busy ? "Working…" : "Confirm and save"}
        </button>
      </div>
    </section>
  );
}

function QuestionBody({ q }) {
  return (
    <div className="q-body">
      <p className="q-text">{q.question}</p>
      <ul className="q-options">
        {q.options.map((option, index) => (
          <li
            key={index}
            className={index === q.correct_index ? "q-option correct" : "q-option"}
          >
            <span className="letter">{LETTERS[index]}</span>
            <span>{option}</span>
          </li>
        ))}
      </ul>
      {q.explanation && <p className="q-explain">{q.explanation}</p>}
    </div>
  );
}

export default function QuizEditor() {
  const { lessonId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // null | "add" | "paste" | { edit: id }
  const [unsaved, setUnsaved] = useState(false);
  const [working, setWorking] = useState(false);

  const base = `/teacher/lessons/${encodeURIComponent(lessonId)}/quiz`;

  const load = useCallback(async () => {
    setQuiz(await api.get(base));
  }, [base]);

  useEffect(() => {
    let active = true;
    setQuiz(null);
    setError("");
    Promise.all([api.get(base), api.get("/courses")])
      .then(([data, courses]) => {
        if (!active) return;
        setQuiz(data);
        const lessons = courses.flatMap((c) => c.modules.flatMap((m) => m.lessons));
        setTitle(lessons.find((l) => l.id === lessonId)?.title ?? lessonId);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [base, lessonId]);

  // Warn before a refresh or tab close throws away typing.
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const closeForm = () => {
    setMode(null);
    setUnsaved(false);
  };

  const cancelForm = () => {
    if (unsaved && !window.confirm("Discard what you typed?")) return;
    closeForm();
  };

  const openForm = (next) => {
    if (unsaved && !window.confirm("Discard what you typed?")) return;
    setUnsaved(false);
    setMode(next);
  };

  // Runs one change, shows the server's message if it fails.
  const run = async (action) => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const addQuestion = async (body) => {
    await api.post(`${base}/questions`, body);
    await load();
    closeForm();
  };

  const saveEdit = async (id, body) => {
    await api.put(`/teacher/quiz-questions/${id}`, body);
    await load();
    closeForm();
  };

  const remove = (q) => {
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    run(async () => {
      await api.del(`/teacher/quiz-questions/${q.id}`);
      await load();
    });
  };

  const move = (index, step) => {
    const ids = quiz.questions.map((q) => q.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(async () => {
      setQuiz(await api.put(`${base}/order`, { question_ids: ids }));
    });
  };

  if (error && !quiz) {
    return (
      <>
        <Link to="/content" className="back">
          <ChevronLeft size={18} />
          Lessons
        </Link>
        <p className="notice" role="alert">
          {error}
        </p>
      </>
    );
  }

  if (!quiz) {
    return (
      <>
        <div className="skeleton tall" />
        <div className="skeleton tall" />
      </>
    );
  }

  const count = quiz.questions.length;
  const full = count >= quiz.max_questions;

  return (
    <>
      <Link to="/content" className="back">
        <ChevronLeft size={18} />
        Lessons
      </Link>

      <header className="page-head">
        <div>
          <p className="label">Quiz</p>
          <h1>{title}</h1>
        </div>
        <span className="pill num">
          {count} / {quiz.max_questions} questions
        </span>
      </header>

      <p className="hint live-note">
        Changes go live for students right away.
      </p>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <div className="toolbar">
        <button
          className="btn"
          onClick={() => openForm("add")}
          disabled={full || working}
        >
          <Plus size={18} />
          Add question
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => openForm("paste")}
          disabled={full || working}
        >
          <ClipboardPaste size={18} />
          Paste questions
        </button>
        {full && <span className="hint">The quiz is full.</span>}
      </div>

      {mode === "add" && (
        <QuestionForm
          submitLabel="Add question"
          onSubmit={addQuestion}
          onCancel={cancelForm}
          onDirty={() => setUnsaved(true)}
        />
      )}

      {mode === "paste" && (
        <PastePanel
          lessonId={lessonId}
          used={count}
          max={quiz.max_questions}
          onSaved={async () => {
            await load();
            closeForm();
          }}
          onCancel={cancelForm}
          onDirty={() => setUnsaved(true)}
        />
      )}

      {count === 0 && mode === null && (
        <section className="empty">
          <p className="empty-title">No questions yet</p>
          <p>Add a question, or paste many at once.</p>
        </section>
      )}

      {quiz.questions.map((q, index) =>
        mode && mode.edit === q.id ? (
          <QuestionForm
            key={q.id}
            initial={q}
            submitLabel="Save changes"
            onSubmit={(body) => saveEdit(q.id, body)}
            onCancel={cancelForm}
            onDirty={() => setUnsaved(true)}
          />
        ) : (
          <article className="card q-card" key={q.id}>
            <div className="q-head">
              <span className="q-num num">{index + 1}</span>
              <div className="q-main">
                <QuestionBody q={q} />
              </div>
              <div className="q-actions">
                <button
                  className="icon-btn"
                  onClick={() => move(index, -1)}
                  disabled={working || index === 0}
                  aria-label="Move up"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => move(index, 1)}
                  disabled={working || index === count - 1}
                  aria-label="Move down"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => openForm({ edit: q.id })}
                  disabled={working}
                  aria-label="Edit question"
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => remove(q)}
                  disabled={working}
                  aria-label="Delete question"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ),
      )}
    </>
  );
}
