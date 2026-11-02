// Leaderboard rules as plain functions (no React), so they're easy to test.

// XP for the chosen period: "weekly" | "monthly" | "overall".
export function xpForPeriod(entry, period) {
  if (period === "weekly") return Number(entry.weeklyXp) || 0;
  if (period === "monthly") return Number(entry.monthlyXp) || 0;
  return Number(entry.xp) || 0;
}

// Entries ranked for a period: highest XP first, ties by name. Each gets
// its position, its XP for the period, and whether it's the student.
export function rankEntries(entries, period, studentId) {
  return [...(entries ?? [])]
    .map((entry) => ({ ...entry, periodXp: xpForPeriod(entry, period), isYou: entry.id === studentId }))
    .sort((a, b) => b.periodXp - a.periodXp || String(a.name).localeCompare(String(b.name)))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

// How a name is shown. Classmates see full names; on the national board
// only first name and last initial ("Abebe K.").
export function displayName(name, scope) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Student";
  if (scope !== "national" || parts.length === 1) return scope === "national" ? parts[0] : parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function initials(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}
