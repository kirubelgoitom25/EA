import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Flame, Zap } from "lucide-react";
import { api } from "../lib/api.js";
import { formatXp, lastActive, toNumber } from "../lib/format.js";
import { Avatar, ProgressBar, RankBadge, Tabs } from "../components/ui.jsx";

const PERIODS = [
  { key: "weekly", label: "Weekly", field: "weekly_xp" },
  { key: "monthly", label: "Monthly", field: "monthly_xp" },
  { key: "overall", label: "Overall", field: "xp" },
];

export default function ClassPage() {
  const { classId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("weekly");

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");

    const id = encodeURIComponent(classId);
    Promise.all([
      api.get("/classes"),
      api.get(`/classes/${id}/students`),
      api.get(`/classes/${id}/courses`),
    ])
      .then(([classes, students, courses]) => {
        if (!active) return;
        const found = classes.find((c) => c.id === classId);
        setData({ name: found ? found.name : classId, students, courses });
      })
      .catch((err) => {
        if (active) setError(err.message);
      });

    return () => {
      active = false;
    };
  }, [classId]);

  const field = PERIODS.find((p) => p.key === period).field;

  // Active students ranked by the XP of the chosen period. Ties share a rank,
  // and a student with 0 XP in the period gets no rank.
  const { rows, inactive } = useMemo(() => {
    if (!data) return { rows: [], inactive: [] };
    const active = data.students.filter((s) => s.is_active);
    const sorted = [...active].sort(
      (a, b) =>
        toNumber(b[field]) - toNumber(a[field]) || a.name.localeCompare(b.name),
    );
    const ranked = sorted.map((s) => {
      const xp = toNumber(s[field]);
      const rank =
        xp > 0
          ? 1 + active.filter((o) => toNumber(o[field]) > xp).length
          : null;
      return { ...s, periodXp: xp, rank };
    });
    return {
      rows: ranked,
      inactive: data.students.filter((s) => !s.is_active),
    };
  }, [data, field]);

  if (error) {
    return (
      <>
        <Link to="/classes" className="back">
          <ChevronLeft size={18} />
          Classes
        </Link>
        <p className="notice" role="alert">
          {error}
        </p>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="skeleton tall" />
        <div className="skeleton tall" />
      </>
    );
  }

  const activeStudents = data.students.filter((s) => s.is_active);
  const avgProgress = activeStudents.length
    ? Math.round(
        activeStudents.reduce((sum, s) => sum + s.progress, 0) /
          activeStudents.length,
      )
    : 0;
  const activeThisWeek = activeStudents.filter(
    (s) => toNumber(s.weekly_xp) > 0,
  ).length;

  return (
    <>
      <Link to="/classes" className="back">
        <ChevronLeft size={18} />
        Classes
      </Link>

      <section className="hero">
        <p className="hero-eyebrow">CLASS</p>
        <h1>{data.name}</h1>
        <div className="hero-stats">
          <div>
            <div className="hero-value num">{activeStudents.length}</div>
            <div className="hero-label">Students</div>
          </div>
          <div className="hero-divider" />
          <div>
            <div className="hero-value num">{avgProgress}%</div>
            <div className="hero-label">Avg progress</div>
          </div>
          <div className="hero-divider" />
          <div>
            <div className="hero-value num">
              {activeThisWeek} / {activeStudents.length}
            </div>
            <div className="hero-label">Active this week</div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="label">Class ranking</h2>
          <Tabs tabs={PERIODS} value={period} onChange={setPeriod} />
        </div>

        {data.students.length === 0 && (
          <p className="empty-inline">No students in this class yet.</p>
        )}

        {rows.map((s) => (
          <Link className="row row-link" to={`/students/${s.id}`} key={s.id}>
            <RankBadge rank={s.rank} />
            <Avatar name={s.name} />
            <span className="who">
              <span className="name">{s.name}</span>
              <span className="sub">{lastActive(s.last_active_at)}</span>
            </span>
            <ProgressBar value={s.progress} />
            <span className="pill num">
              <Zap size={13} />
              {formatXp(s.periodXp)} XP
            </span>
            <span
              className={`pill num ${s.current_streak === 0 ? "pill-cold" : ""}`}
            >
              <Flame size={13} />
              {s.current_streak}
            </span>
          </Link>
        ))}

        {inactive.length > 0 && (
          <>
            <div className="row">
              <span className="label">Inactive</span>
            </div>
            {inactive.map((s) => (
              <Link
                className="row row-link row-dim"
                to={`/students/${s.id}`}
                key={s.id}
              >
                <RankBadge rank={null} />
                <Avatar name={s.name} />
                <span className="who">
                  <span className="name">{s.name}</span>
                  <span className="sub">{lastActive(s.last_active_at)}</span>
                </span>
                <span className="pill pill-cold">Inactive</span>
              </Link>
            ))}
          </>
        )}
      </section>

      {data.courses.length > 0 && (
        <section className="card section">
          <div className="card-head">
            <h2 className="label">Courses</h2>
          </div>
          {data.courses.map((c) => (
            <div className="row" key={c.id}>
              <span className="name">{c.title}</span>
              <span className="sub">{c.total_lessons} lessons</span>
              <ProgressBar value={c.avg_progress} />
              <span className="pill num">{c.avg_progress}%</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
