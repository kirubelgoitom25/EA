import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { api } from "../lib/api.js";
import { courseLabel, formatXp, rankBy } from "../lib/format.js";
import { Avatar, RankBadge, Tabs } from "../components/ui.jsx";

const PERIODS = [
  { key: "weekly", label: "Weekly", field: "weekly_xp" },
  { key: "monthly", label: "Monthly", field: "monthly_xp" },
  { key: "overall", label: "Overall", field: "xp" },
];
const VIEWS = [
  { key: "classes", label: "Classes" },
  { key: "courses", label: "Courses" },
];

function ClassStandings({ field }) {
  const [standings, setStandings] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("/classes/standings")
      .then((data) => {
        if (active) setStandings(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(
    () => (standings ? rankBy(standings, field) : []),
    [standings, field],
  );

  if (error)
    return (
      <p className="notice" role="alert">
        {error}
      </p>
    );
  if (!standings) return <div className="skeleton tall" />;
  if (standings.length === 0) {
    return (
      <section className="empty">
        <p className="empty-title">No classes to rank yet</p>
        <p>Once you are linked to a class, it will be ranked here.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="label">Class ranking</h2>
        <span className="pill">Total XP</span>
      </div>
      {rows.map((c) => {
        const content = (
          <>
            <RankBadge rank={c.rank} />
            <span className="who">
              <span className="name">{c.name}</span>
              <span className="sub">{c.student_count} students</span>
            </span>
            {c.is_mine && <span className="pill">Your class</span>}
            <span className="pill num">
              <Zap size={13} />
              {formatXp(c.periodXp)} XP
            </span>
          </>
        );
        // Other classes show a name and totals only, and are not clickable.
        return c.is_mine && c.id ? (
          <Link
            className="row row-link row-mine"
            to={`/classes/${encodeURIComponent(c.id)}`}
            key={c.id}
          >
            {content}
          </Link>
        ) : (
          <div className="row" key={c.id || c.name}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

function CourseRankings({ field }) {
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState("");
  const [courses, setCourses] = useState(null);
  const [courseId, setCourseId] = useState("");
  const [ranking, setRanking] = useState(null);
  const [error, setError] = useState("");

  // 1. The teacher's classes.
  useEffect(() => {
    let active = true;
    api
      .get("/classes")
      .then((data) => {
        if (!active) return;
        setClasses(data);
        if (data.length > 0) setClassId(data[0].id);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  // 2. The courses of the chosen class.
  useEffect(() => {
    if (!classId) return undefined;
    let active = true;
    setCourses(null);
    setCourseId("");
    setRanking(null);
    setError("");
    api
      .get(`/classes/${encodeURIComponent(classId)}/courses`)
      .then((data) => {
        if (!active) return;
        setCourses(data);
        if (data.length > 0) setCourseId(data[0].id);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [classId]);

  // 3. The ranking of the chosen course.
  useEffect(() => {
    if (!classId || !courseId) return undefined;
    let active = true;
    setRanking(null);
    api
      .get(
        `/classes/${encodeURIComponent(classId)}/courses/${encodeURIComponent(courseId)}/ranking`,
      )
      .then((data) => {
        if (active) setRanking(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [classId, courseId]);

  const rows = useMemo(
    () => (ranking ? rankBy(ranking, field) : []),
    [ranking, field],
  );

  if (error)
    return (
      <p className="notice" role="alert">
        {error}
      </p>
    );
  if (!classes) return <div className="skeleton tall" />;
  if (classes.length === 0) {
    return (
      <section className="empty">
        <p className="empty-title">No class linked yet</p>
        <p>Ask the admin to add you to a class. It will show up here.</p>
      </section>
    );
  }

  return (
    <>
      <div className="toolbar">
        {classes.length > 1 ? (
          <select
            className="select"
            aria-label="Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="label">{classes[0].name}</span>
        )}
        {courses && courses.length > 0 && (
          <Tabs
            tabs={courses.map((c) => ({
              key: c.id,
              label: courseLabel(c, courses),
            }))}
            value={courseId}
            onChange={setCourseId}
          />
        )}
      </div>

      {courses && courses.length === 0 && (
        <section className="empty">
          <p className="empty-title">No courses yet</p>
          <p>This class has no courses assigned.</p>
        </section>
      )}

      {!courses || (courseId && !ranking) ? (
        <div className="skeleton tall" />
      ) : null}

      {ranking && (
        <section className="card">
          <div className="card-head">
            <h2 className="label">Course ranking</h2>
            <span className="pill">{rows.length} students</span>
          </div>
          {rows.length === 0 && (
            <p className="empty-inline">No students in this class yet.</p>
          )}
          {rows.map((s) => (
            <Link className="row row-link" to={`/students/${s.id}`} key={s.id}>
              <RankBadge rank={s.rank} />
              <Avatar name={s.name} />
              <span className="who">
                <span className="name">{s.name}</span>
              </span>
              <span className="pill num">
                <Zap size={13} />
                {formatXp(s.periodXp)} XP
              </span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

export default function Rankings() {
  const [view, setView] = useState("classes");
  const [period, setPeriod] = useState("weekly");
  const field = PERIODS.find((p) => p.key === period).field;

  return (
    <>
      <header className="page-head">
        <div>
          <p className="label">Teacher dashboard</p>
          <h1>Rankings</h1>
        </div>
        <Tabs tabs={VIEWS} value={view} onChange={setView} />
      </header>

      <div className="toolbar">
        <Tabs tabs={PERIODS} value={period} onChange={setPeriod} />
      </div>

      {view === "classes" ? (
        <ClassStandings field={field} />
      ) : (
        <CourseRankings field={field} />
      )}
    </>
  );
}
