import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Flame, Zap } from "lucide-react";
import { api } from "../lib/api.js";
import {
  courseLabel,
  formatXp,
  lastActive,
  rankBy,
  statusLine,
  toNumber,
} from "../lib/format.js";
import { usePresence } from "../lib/usePresence.js";
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
  const presence = usePresence(classId);

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

  const { rows, inactive } = useMemo(() => {
    if (!data) return { rows: [], inactive: [] };
    const active = data.students.filter((s) => s.is_active);
    return {
      rows: rankBy(active, field),
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
  const presenceLoaded = Object.keys(presence).length > 0;
  const onlineNow = activeStudents.filter((s) => presence[s.id]?.online).length;

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
            <div className="hero-value num">
              {presenceLoaded ? `${onlineNow} / ${activeStudents.length}` : "–"}
            </div>
            <div className="hero-label">Online now</div>
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
          <h2 className="label">
            Class ranking · {activeStudents.length} students
          </h2>
          <Tabs tabs={PERIODS} value={period} onChange={setPeriod} />
        </div>

        {data.students.length === 0 && (
          <p className="empty-inline">No students in this class yet.</p>
        )}

        {rows.map((s) => {
          const entry = presence[s.id];
          return (
            <Link className="row row-link" to={`/students/${s.id}`} key={s.id}>
              <RankBadge rank={s.rank} />
              <Avatar name={s.name} online={entry ? entry.online : undefined} />
              <span className="who">
                <span className="name">{s.name}</span>
                <span
                  className={`sub${entry && entry.online ? " online" : ""}`}
                >
                  {statusLine({
                    entry,
                    currentCourse: s.current_course,
                    lastActiveAt: s.last_active_at,
                    courses: data.courses,
                  })}
                </span>
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
          );
        })}

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
              <span className="name">{courseLabel(c, data.courses)}</span>
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
