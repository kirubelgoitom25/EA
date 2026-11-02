// Every course is a "world": its own colour and pattern, chosen from the course id so a course always
// looks the same, on every screen and every phone. No landscapes: a world is a bold emblem (colour +
// pattern + the subject's glyph). Plain data and functions, so it is easy to test.

// bg: the emblem's colour. tint / shade: lighter and deeper partners for its pattern.
// on: the glyph colour that reads on bg.
export const WORLDS = [
  { key: "ember", bg: "#F49200", tint: "#FFB547", shade: "#D97300", on: "#2B1A38" },
  { key: "berry", bg: "#DE468E", tint: "#F27DB2", shade: "#B72A70", on: "#FFFFFF" },
  { key: "plum", bg: "#6E4A86", tint: "#9772B0", shade: "#4F3463", on: "#FFFFFF" },
  { key: "lagoon", bg: "#1F8F9C", tint: "#58B9C4", shade: "#14707B", on: "#FFFFFF" },
  { key: "fern", bg: "#3E9A62", tint: "#72C08F", shade: "#2C7A49", on: "#FFFFFF" },
  { key: "sun", bg: "#FFC83D", tint: "#FFDF80", shade: "#E7A800", on: "#2B1A38" },
];

export const PATTERNS = ["rings", "dots", "waves", "rays", "scales"];

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value >>> 0;
}

// The world of a course: { key, bg, tint, shade, on, pattern }.
export function worldFor(courseId) {
  const h = hash(String(courseId ?? ""));
  const world = WORLDS[h % WORLDS.length];
  return { ...world, pattern: PATTERNS[Math.floor(h / WORLDS.length) % PATTERNS.length] };
}
