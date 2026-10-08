export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// XP and other decimals arrive from the API as strings.
export const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const formatXp = (value) =>
  toNumber(value).toLocaleString("en-US", { maximumFractionDigits: 1 });

const startOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// "Active today" / "Active yesterday" / "Active 3 days ago", by calendar day.
export function lastActive(iso) {
  if (!iso) return "No activity yet";
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000,
  );
  if (days <= 0) return "Active today";
  if (days === 1) return "Active yesterday";
  return `Active ${days} days ago`;
}

// "just now" / "5 min ago" / "3 h ago". Older than a day gives null.
export function formatSeen(seconds) {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return null;
}

// Ranks rows by a field, highest first. Ties share a rank, and a row with 0 in
// that field gets no rank. Each row needs a "name".
export function rankBy(items, field) {
  const sorted = [...items].sort(
    (a, b) =>
      toNumber(b[field]) - toNumber(a[field]) || a.name.localeCompare(b.name),
  );
  return sorted.map((item) => {
    const xp = toNumber(item[field]);
    const rank =
      xp > 0 ? 1 + items.filter((o) => toNumber(o[field]) > xp).length : null;
    return { ...item, periodXp: xp, rank };
  });
}

// Some courses share a title (two are both called "A2"), so the id is added
// whenever the title alone would be ambiguous.
export function courseLabel(course, all = []) {
  const clash = all.filter((c) => c.title === course.title).length > 1;
  return clash ? `${course.title} · ${course.id}` : course.title;
}

// The one status line shown under a student's name.
//   entry         presence for this student (or undefined before it loads)
//   currentCourse the course of their last activity (or null)
//   lastActiveAt  when they last earned XP; leave undefined where unknown
//   courses       course list, used to tell apart courses with the same title
export function statusLine({ entry, currentCourse, lastActiveAt, courses }) {
  if (entry && entry.online) {
    if (entry.lesson) {
      const course = entry.course ? courseLabel(entry.course, courses) : null;
      return `Online · ${course ? `${course} · ` : ""}${entry.lesson.title}`;
    }
    return "Online · In the app";
  }

  const seen = entry ? formatSeen(entry.seconds_since_seen) : null;
  const course = currentCourse ? courseLabel(currentCourse, courses) : null;

  if (seen)
    return course ? `Last seen ${seen} · ${course}` : `Last seen ${seen}`;
  if (lastActiveAt !== undefined) {
    const last = lastActive(lastActiveAt);
    return course ? `${last} · ${course}` : last;
  }
  return course ? `Last worked on ${course}` : "No activity yet";
}
