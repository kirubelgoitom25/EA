import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, closeServer } from "./helpers.mjs";

const lib = await loadModule("/src/lib/studio.js");
test.after(closeServer);

test("quiz and practice are one per lesson, archived ones still count as taken", () => {
  const list = [{ kind: "quiz", archived: true }, { kind: "video" }];
  assert.equal(lib.kindTaken(list, "quiz"), true);
  assert.equal(lib.kindTaken(list, "practice"), false);
  assert.equal(lib.kindTaken(list, "video"), false); // any number of videos
  assert.equal(lib.kindTaken([{ kind: "reading" }], "reading"), false);
});

test("moveId swaps neighbours and refuses to leave the list", () => {
  assert.deepEqual(lib.moveId([1, 2, 3], 2, "up"), [2, 1, 3]);
  assert.deepEqual(lib.moveId([1, 2, 3], 2, "down"), [1, 3, 2]);
  assert.equal(lib.moveId([1, 2, 3], 1, "up"), null);
  assert.equal(lib.moveId([1, 2, 3], 3, "down"), null);
  assert.equal(lib.moveId([1, 2, 3], 9, "up"), null);
});

test("YouTube links are accepted exactly like the backend", () => {
  const good = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=5",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ];
  for (const url of good) assert.equal(lib.parseYouTube(url).ok, true, url);
  const bad = [
    "",
    "   ",
    "not a link",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ", // not https
    "https://vimeo.com/123456789",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL1234567890A",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
  ];
  for (const url of bad) assert.equal(lib.parseYouTube(url).ok, false, url);
});

const outline = (lessonsPerModule, archivedModule = false) => ({
  modules: lessonsPerModule.map((lessons, i) => ({
    id: `m${i}`,
    archived: archivedModule && i === 0,
    lessons: lessons.map((archived, j) => ({ id: `l${i}${j}`, archived, activities: [] })),
  })),
});

test("publishing needs at least one live lesson", () => {
  assert.equal(lib.publishCheck(outline([])).ok, false);
  assert.equal(lib.publishCheck(outline([[]])).ok, false);
  assert.equal(lib.publishCheck(outline([[true]])).ok, false); // only an archived lesson
  assert.equal(lib.publishCheck(outline([[true], [false]])).ok, true);
  assert.equal(lib.publishCheck(outline([[false]], true)).ok, false); // its chapter is archived
  assert.match(lib.publishCheck(outline([])).reason, /at least one lesson/);
});

test("outline counts ignore archived chapters and lessons", () => {
  assert.deepEqual(lib.outlineCounts(outline([[false, true], [false]], true)), { chapters: 1, lessons: 1 });
});

test("activity counts skip archived activities", () => {
  const lesson = { activities: [{ kind: "video" }, { kind: "video" }, { kind: "quiz", archived: true }, { kind: "reading" }] };
  assert.deepEqual(lib.activityCounts(lesson), { video: 2, reading: 1 });
});

test("an unreachable Studio gets a clear message, real server messages pass through", () => {
  assert.match(lib.friendlyError("Not Found"), /not available on this server yet/);
  assert.match(lib.friendlyError(""), /not available/);
  assert.equal(lib.friendlyError("Add at least one lesson before publishing"), "Add at least one lesson before publishing");
});

test("removal messages say when the server archived instead of deleting", () => {
  assert.match(lib.removedMessage({ deleted: false, archived: true }, "lesson"), /archived instead/);
  assert.match(lib.removedMessage({ deleted: true, archived: false }, "lesson"), /deleted/);
});

test("timeAgo", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(lib.timeAgo("2026-11-02T11:59:40Z", now), "just now");
  assert.equal(lib.timeAgo("2026-11-02T11:30:00Z", now), "30 min ago");
  assert.equal(lib.timeAgo("2026-11-02T09:00:00Z", now), "3 h ago");
  assert.equal(lib.timeAgo("2026-10-31T12:00:00Z", now), "2 days ago");
  assert.equal(lib.timeAgo(null, now), null);
  assert.equal(lib.timeAgo("garbage", now), null);
});

test("nothing is required by default in the shared constants", () => {
  assert.deepEqual(lib.KINDS.map((k) => k.kind), ["video", "quiz", "practice", "reading"]);
  assert.deepEqual(lib.ONE_PER_LESSON, ["quiz", "practice"]);
});
