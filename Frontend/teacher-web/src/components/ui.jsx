import { initials } from "../lib/format.js";

export function Avatar({ name, size = 36 }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
    >
      {initials(name)}
    </span>
  );
}

// Gold, silver and bronze for 1 to 3, like the student app. No rank shows a dash.
export function RankBadge({ rank }) {
  const tone =
    rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
  return <span className={`rank ${tone}`}>{rank ?? "–"}</span>;
}

export function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="track"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          className={value === t.key ? "tab active" : "tab"}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
