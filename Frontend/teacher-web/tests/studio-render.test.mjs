import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";
import { loadModule, closeServer } from "./helpers.mjs";

const Parts = await loadModule("/src/components/studio/Parts.jsx");
const { default: ActivityForm } = await loadModule("/src/components/studio/ActivityForm.jsx");
const Dashboard = await loadModule("/src/pages/StudioDashboard.jsx");
const { default: CourseEditor } = await loadModule("/src/pages/CourseEditor.jsx");
const { default: LessonActivities } = await loadModule("/src/pages/LessonActivities.jsx");
test.after(closeServer);

const render = (el, at = "/") => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [at] }, el));
const noop = () => {};
// Pages use useBlocker, which needs a data router, exactly like the real app.
const page = (path, element, at) =>
  renderToStaticMarkup(h(RouterProvider, { router: createMemoryRouter([{ path, element }], { initialEntries: [at] }) }));

test("every status is a word, not only a colour", () => {
  for (const [status, word] of [["draft", "Draft"], ["published", "Published"], ["unpublished", "Unpublished"]]) {
    const html = render(h(Parts.StatusChip, { status }));
    assert.match(html, new RegExp(`status-${status}`));
    assert.match(html, new RegExp(`>${word}<`));
  }
});

test("course tiles: editable ones link to the editor, others do not", () => {
  const base = { id: "c1", title: "Bio", description: "Life", status: "draft", owned: true, editable: true, updated_at: null, published_at: null };
  const mine = render(h(Dashboard.CourseCard, { course: base }));
  assert.match(mine, /href="\/studio\/courses\/c1"/);
  assert.doesNotMatch(mine, /Class course/);

  const shared = render(h(Dashboard.CourseCard, { course: { ...base, owned: false, status: "published" } }));
  assert.match(shared, /Class course/);
  assert.match(shared, /href="\/studio\/courses\/c1"/);

  const viewOnly = render(h(Dashboard.CourseCard, { course: { ...base, owned: false, editable: false } }));
  assert.doesNotMatch(viewOnly, /href=/);
  assert.match(viewOnly, /View only/);
});

const form = (props) =>
  render(h(ActivityForm, { onSubmit: noop, onCancel: noop, setDirty: noop, dirtyKey: "k", ...props }));

test("a new activity is never required by default, for every kind", () => {
  for (const kind of ["video", "quiz", "practice", "reading"]) {
    const html = form({ kind });
    assert.match(html, /type="checkbox"/, kind);
    assert.doesNotMatch(html, /type="checkbox"[^>]*checked/, `${kind} must start unchecked`);
    assert.match(html, /never stops them from finishing the lesson/);
  }
});

test("editing shows the saved required flag", () => {
  const html = form({ kind: "reading", initial: { id: 1, kind: "reading", title: "R", is_required: true, reading_body: "text" } });
  assert.match(html, /type="checkbox"[^>]*checked/);
  assert.match(html, />text</);
});

test("each kind shows only its own fields", () => {
  const video = form({ kind: "video" });
  assert.match(video, /YouTube link/);
  assert.doesNotMatch(video, /Reading text/);
  assert.match(video, /disabled=""[^>]*>Add video/); // cannot add without a valid link

  const reading = form({ kind: "reading" });
  assert.match(reading, /Reading text/);
  assert.match(reading, /0 \/ 20,000/);
  assert.doesNotMatch(reading, /YouTube link/);

  for (const kind of ["quiz", "practice"]) {
    const html = form({ kind });
    assert.doesNotMatch(html, /YouTube link|Reading text/);
    assert.match(html, new RegExp(`creates the lesson’s ${kind}`));
  }
});

test("a bad video link is explained", () => {
  const html = form({ kind: "video", initial: { id: 1, kind: "video", title: "V", is_required: false, video_url: "https://vimeo.com/1" } });
  assert.match(html, /Use a YouTube link that starts with https/);
});

test("confirm dialog shows its text only when open", () => {
  const closed = render(h(Parts.ConfirmDialog, { open: false, title: "Delete?", onConfirm: noop, onCancel: noop }, "Careful"));
  assert.doesNotMatch(closed, /Careful/);
  const open = render(h(Parts.ConfirmDialog, { open: true, title: "Delete?", confirmLabel: "Delete", danger: true, onConfirm: noop, onCancel: noop }, "Careful"));
  assert.match(open, /Delete\?/);
  assert.match(open, /Careful/);
  assert.match(open, /btn btn-danger/);
});

test("pages start in a loading state and never show invented content", () => {
  const dash = page("/studio", h(Dashboard.default), "/studio");
  assert.match(dash, /Your courses/);
  assert.match(dash, /skeleton/);
  assert.match(dash, /disabled=""[^>]*>.*New course/s); // cannot start before the list loads
  assert.doesNotMatch(dash, /status-chip/);
  assert.doesNotMatch(dash, /unsaved changes/); // the leave prompt is closed

  const editor = page("/studio/courses/:courseId", h(CourseEditor), "/studio/courses/c1");
  assert.match(editor, /skeleton/);
  assert.doesNotMatch(editor, /Publish/);

  const lesson = page("/studio/courses/:courseId/lessons/:lessonId", h(LessonActivities), "/studio/courses/c1/lessons/l1");
  assert.match(lesson, /skeleton/);
  assert.match(lesson, /Back to course/);
});

test("the leave prompt only appears for a blocked navigation", () => {
  const closed = render(h(Parts.LeavePrompt, { blocker: { state: "unblocked" } }));
  assert.doesNotMatch(closed, /unsaved changes/);
  const open = render(h(Parts.LeavePrompt, { blocker: { state: "blocked", proceed: noop, reset: noop } }));
  assert.match(open, /You have unsaved changes/);
  assert.match(open, /Stay on this page/);
  assert.match(open, /Leave and discard/);
});
