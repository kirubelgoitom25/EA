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
