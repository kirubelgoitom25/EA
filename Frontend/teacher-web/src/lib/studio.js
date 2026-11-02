// Pure helpers for Course Studio. No React and no network, so they can be tested alone.
// The rules mirror docs/API_CONTRACT.md; the backend stays the authority.

export const STATUS = {
  draft: { label: "Draft", help: "Only you can see it." },
  published: { label: "Published", help: "Students can find it." },
  unpublished: {
    label: "Unpublished",
    help: "Hidden from new students. Students already learning keep access.",
  },
};

export const KINDS = [
  { kind: "video", label: "Video", help: "A YouTube video." },
  { kind: "quiz", label: "Quiz", help: "Multiple-choice questions. One per lesson." },
  { kind: "practice", label: "Practice", help: "Fill-in and choose exercises. One per lesson." },
  { kind: "reading", label: "Reading", help: "A short text to read." },
];

// A lesson can hold one quiz and one practice (kept from the existing rules).
export const ONE_PER_LESSON = ["quiz", "practice"];

export const MAX_READING_LEN = 20000;
export const MAX_TITLE_LEN = 200;
export const MAX_DESCRIPTION_LEN = 2000;

export const kindLabel = (kind) => KINDS.find((k) => k.kind === kind)?.label ?? kind;

// Quiz/practice already used by this lesson, archived or not. An archived one has to be
// restored, not recreated, so it counts as taken.
export function kindTaken(activities, kind) {
  return ONE_PER_LESSON.includes(kind) && activities.some((a) => a.kind === kind);
}

export const active = (items) => items.filter((item) => !item.archived);
export const archivedOnly = (items) => items.filter((item) => item.archived);

// The new order after moving `id` one step. Returns null when it cannot move.
export function moveId(ids, id, direction) {
  const from = ids.indexOf(id);
  const to = from + (direction === "up" ? -1 : 1);
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// Same acceptance as the backend: https, a YouTube host, and an 11-character video id.
// This only gives early feedback. The server checks again.
export function parseYouTube(value) {
  const text = (value ?? "").trim();
  if (!text) return { ok: false, message: "Paste a YouTube link." };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, message: "That is not a link." };
  }
  const bad = { ok: false, message: "Use a YouTube link that starts with https://" };
  if (url.protocol !== "https:" || !YOUTUBE_HOSTS.includes(url.hostname)) return bad;
  let id = "";
  if (url.hostname === "youtu.be") id = url.pathname.replace(/^\//, "");
  else if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
  else if (url.pathname.startsWith("/embed/")) id = url.pathname.slice("/embed/".length);
  else return bad;
  if (!YOUTUBE_ID.test(id)) return bad;
  return { ok: true, id, url: text };
}

// Counts of what is live (not archived) in a course outline.
export function outlineCounts(outline) {
  let chapters = 0;
  let lessons = 0;
  for (const module of outline?.modules ?? []) {
    if (module.archived) continue;
    chapters += 1;
    lessons += active(module.lessons).length;
  }
  return { chapters, lessons };
}

// Publishing needs at least one live lesson. The server enforces this too.
export function publishCheck(outline) {
  const { lessons } = outlineCounts(outline);
  if (lessons === 0) return { ok: false, reason: "Add at least one lesson before publishing." };
  return { ok: true, reason: "" };
}

// The activity kinds present in a lesson, counted, live ones only.
export function activityCounts(lesson) {
  const counts = {};
  for (const a of active(lesson.activities ?? [])) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
  return counts;
}

// FastAPI answers a missing route with exactly "Not Found".
export function friendlyError(message) {
  if (!message || message === "Not Found") {
    return "Course Studio is not available on this server yet. Nothing was changed.";
  }
  return message;
}

// What a DELETE did, in words. The server archives instead of deleting when students
// have progress.
export function removedMessage(result, noun) {
  if (result?.archived) return `The ${noun} has student progress, so it was archived instead of deleted.`;
  return `The ${noun} was deleted.`;
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(then).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const trimmed = (value) => (value ?? "").trim();
