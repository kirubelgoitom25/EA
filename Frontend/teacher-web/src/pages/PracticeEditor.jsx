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

const PASTE_EXAMPLE = `1. Pick the correct form
Sentence: If she ___ more, she would pass.
a. studies
b. studied
c. will study
Answer: b
Explanation: Second conditional uses past simple.

2. Complete the sentence
Sentence: If I ___ (have) time, I would help.
Answer: had`;

const TYPES = [
  { key: "choose", label: "Choose" },
  { key: "fill", label: "Fill in" },
];

function ItemBody({ item }) {
  return (
    <div className="q-body">
      <p className="q-text">{item.question}</p>
      {item.sentence && <p className="q-sentence">{item.sentence}</p>}
      {item.type === "choose" ? (
        <ul className="q-options">
          {item.options.map((option, index) => (
            <li
              key={index}
              className={index === item.correct_index ? "q-option correct" : "q-option"}
            >
              <span className="letter">{LETTERS[index]}</span>
              <span>{option}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="q-answer">
          <span className="label">Answer</span> {item.answer}
        </p>
      )}
      {item.explanation && <p className="q-explain">{item.explanation}</p>}
    </div>
  );
}

function ItemForm({ initial, submitLabel, onSubmit, onCancel, onDirty }) {
  const [type, setType] = useState(initial?.type ?? "choose");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [sentence, setSentence] = useState(initial?.sentence ?? "");
  const [options, setOptions] = useState(initial?.options ?? ["", ""]);
  const [correct, setCorrect] = useState(initial?.correct_index ?? 0);
  const [answer, setAnswer] = useState(initial?.answer ?? "");
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
    const common = {
      type,
      question,
      sentence: sentence.trim() ? sentence : null,
      explanation: explanation.trim() ? explanation : null,
    };
    try {
      await onSubmit(
        type === "choose"
          ? { ...common, options, correct_index: correct }
          : { ...common, answer },
      );
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card editor-card" onSubmit={submit}>
      <div className="field">
        <span className="label">Type</span>
        <div className="tabs" role="tablist">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.key}
              role="tab"
              aria-selected={type === t.key}
              className={type === t.key ? "tab active" : "tab"}
              onClick={() => touch(setType)(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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

      <label className="field">
        <span className="label">Sentence (optional)</span>
        <input
          className="input"
          value={sentence}
          onChange={(e) => touch(setSentence)(e.target.value)}
          placeholder="For example: If she ___ more, she would pass."
          maxLength={500}
        />
      </label>

      {type === "choose" ? (
        <OptionRows
          options={options}
          correct={correct}
          onChangeOption={setOption}
          onPickCorrect={touch(setCorrect)}
          onAdd={() => {
            onDirty();
            setOptions([...options, ""]);
          }}
          onRemove={removeOption}
        />
      ) : (
        <label className="field">
          <span className="label">Correct answer</span>
          <input
            className="input"
            value={answer}
            onChange={(e) => touch(setAnswer)(e.target.value)}
            placeholder="What the student must type"
            maxLength={200}
          />
          <span className="hint">
            The student&apos;s answer counts as correct only when it matches this
            exactly. Spaces at the ends and upper or lower case are ignored.
            There is only one accepted answer.
          </span>
        </label>
      )}

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

function PastePanel({ lessonId, used, max, onSaved, onCancel, onDirty }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const base = `/teacher/lessons/${encodeURIComponent(lessonId)}/practice`;

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
        items: preview.items.map((i) => ({
          type: i.type,
          question: i.question,
          sentence: i.sentence,
          options: i.options,
          correct_index: i.correct_index,
          answer: i.answer,
          explanation: i.explanation,
        })),
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const tooMany = preview && used + preview.items.length > max;
  const canConfirm =
    preview && preview.errors.length === 0 && preview.items.length > 0 && !tooMany;

  return (
    <section className="card editor-card">
      <p className="label">Paste practice items</p>
      <p className="hint">
        An item with options (a, b, c) is a choose item and its Answer is a
        letter. An item without options is a fill-in item and its Answer is the
        text. Nothing is saved until you confirm.
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
        placeholder="Paste your items here"
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
          That is {preview.items.length} items and the practice already has {used}. A
          practice can have at most {max}.
        </p>
      )}

      {preview && preview.items.length > 0 && (
        <div className="preview">
          <p className="label">
            {preview.items.length} item{preview.items.length === 1 ? "" : "s"} found
          </p>
          {preview.items.map((item) => (
            <ItemBody key={item.number} item={item} />
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

export default function PracticeEditor() {
  const { lessonId } = useParams();
  const [practice, setPractice] = useState(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // null | "add" | "paste" | { edit: id }
  const [unsaved, setUnsaved] = useState(false);
  const [working, setWorking] = useState(false);

  const base = `/teacher/lessons/${encodeURIComponent(lessonId)}/practice`;

  const load = useCallback(async () => {
    const data = await api.get(base);
    setPractice(data);
    setTitleDraft(data.title ?? "");
  }, [base]);

  useEffect(() => {
    let active = true;
    setPractice(null);
    setError("");
    Promise.all([api.get(base), api.get("/courses")])
      .then(([data, courses]) => {
        if (!active) return;
        setPractice(data);
        setTitleDraft(data.title ?? "");
        const lessons = courses.flatMap((c) => c.modules.flatMap((m) => m.lessons));
        setLessonTitle(lessons.find((l) => l.id === lessonId)?.title ?? lessonId);
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

  const addItem = async (body) => {
    await api.post(`${base}/items`, body);
    await load();
    closeForm();
  };

  const saveEdit = async (id, body) => {
    await api.put(`/teacher/practice-items/${id}`, body);
    await load();
    closeForm();
  };

  const remove = (item) => {
    if (!window.confirm("Delete this item? This cannot be undone.")) return;
    run(async () => {
      await api.del(`/teacher/practice-items/${item.id}`);
      await load();
    });
  };

  const move = (index, step) => {
    const ids = practice.items.map((i) => i.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(async () => {
      setPractice(await api.put(`${base}/order`, { item_ids: ids }));
    });
  };

  const saveTitle = () =>
    run(async () => {
      const data = await api.put(`${base}/title`, { title: titleDraft });
      setPractice(data);
      setTitleDraft(data.title ?? "");
    });

  if (error && !practice) {
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

  if (!practice) {
    return (
      <>
        <div className="skeleton tall" />
        <div className="skeleton tall" />
      </>
    );
  }

  const count = practice.items.length;
  const full = count >= practice.max_items;
  const titleChanged =
    practice.practice_id !== null && titleDraft.trim() !== (practice.title ?? "");

  return (
    <>
      <Link to="/content" className="back">
        <ChevronLeft size={18} />
        Lessons
      </Link>

      <header className="page-head">
        <div>
          <p className="label">Practice</p>
          <h1>{lessonTitle}</h1>
        </div>
        <span className="pill num">
          {count} / {practice.max_items} items
        </span>
      </header>

      <p className="hint live-note">Changes go live for students right away.</p>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {practice.practice_id !== null && (
        <div className="title-row">
          <input
            className="input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            maxLength={200}
            aria-label="Practice title"
          />
          <button
            className="btn btn-ghost"
            onClick={saveTitle}
            disabled={working || !titleChanged || !titleDraft.trim()}
          >
            Save title
          </button>
        </div>
      )}

      <div className="toolbar">
        <button
          className="btn"
          onClick={() => openForm("add")}
          disabled={full || working}
        >
          <Plus size={18} />
          Add item
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => openForm("paste")}
          disabled={full || working}
        >
          <ClipboardPaste size={18} />
          Paste items
        </button>
        {full && <span className="hint">The practice is full.</span>}
      </div>

      {mode === "add" && (
        <ItemForm
          submitLabel="Add item"
          onSubmit={addItem}
          onCancel={cancelForm}
          onDirty={() => setUnsaved(true)}
        />
      )}

      {mode === "paste" && (
        <PastePanel
          lessonId={lessonId}
          used={count}
          max={practice.max_items}
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
          <p className="empty-title">No practice items yet</p>
          <p>Add an item, or paste many at once.</p>
        </section>
      )}

      {practice.items.map((item, index) =>
        mode && mode.edit === item.id ? (
          <ItemForm
            key={item.id}
            initial={item}
            submitLabel="Save changes"
            onSubmit={(body) => saveEdit(item.id, body)}
            onCancel={cancelForm}
            onDirty={() => setUnsaved(true)}
          />
        ) : (
          <article className="card q-card" key={item.id}>
            <div className="q-head">
              <span className="q-num num">{index + 1}</span>
              <div className="q-main">
                <span className="pill pill-cold">
                  {item.type === "choose" ? "Choose" : "Fill in"}
                </span>
                <ItemBody item={item} />
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
                  onClick={() => openForm({ edit: item.id })}
                  disabled={working}
                  aria-label="Edit item"
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => remove(item)}
                  disabled={working}
                  aria-label="Delete item"
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
