import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Trophy, Zap } from "lucide-react";
import { api } from "../lib/api.js";
import { courseLabel, formatXp, statusLine } from "../lib/format.js";
import { usePresence } from "../lib/usePresence.js";
import { Avatar, ProgressBar } from "../components/ui.jsx";

export default function StudentPage() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [className, setClassName] = useState("");
  const [error, setError] = useState("");
  const presence = usePresence(student ? student.class_id : null);

  useEffect(() => {
    let active = true;
    setStudent(null);
    setError("");

    Promise.all([
      api.get(`/students/${encodeURIComponent(studentId)}`),
      api.get("/classes"),
    ])
      .then(([s, classes]) => {
        if (!active) return;
        const found = classes.find((c) => c.id === s.class_id);
        setClassName(found ? found.name : "");
        setStudent(s);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });

    return () => {
      active = false;
    };
  }, [studentId]);

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

  if (!student) {
    return (
      <>
        <div className="skeleton tall" />
        <div className="skeleton tall" />
      </>
    );
  }

  const entry = presence[student.id];
  const online = Boolean(entry && entry.online);
  const backTo = student.class_id
    ? `/classes/${encodeURIComponent(student.class_id)}`
    : "/classes";
  const lessonsDone = student.courses.reduce(
    (sum, c) => sum + c.completed_lessons,
    0,
  );
  const lessonsTotal = student.courses.reduce(
    (sum, c) => sum + c.total_lessons,
    0,
  );

  return (
    <>
      <Link to={backTo} className="back">
        <ChevronLeft size={18} />
        {className || "Back"}
      </Link>

      <header className="student-head">
        <Avatar
          name={student.name}
          size={56}
          online={entry ? entry.online : undefined}
        />
        <div>
          <h1>{student.name}</h1>
          <p className={`sub${online ? " online" : ""}`}>
            {statusLine({
              entry,
              currentCourse: student.current_course,
              courses: student.courses,
            })}
          </p>
          <p className="sub">
            {student.email}
            {!student.is_active && " · Inactive"}
          </p>
        </div>
      </header>

      <section className="hero">
        <p className="hero-eyebrow">PROGRESS</p>
        <div className="hero-stats">
          <div>
            <div className="hero-value num">{formatXp(student.xp)}</div>
            <div className="hero-label">Total XP</div>
          </div>
          <div className="hero-divider" />
          <div>
            <div className="hero-value num">{student.current_streak}</div>
            <div className="hero-label">Day streak</div>
          </div>
          <div className="hero-divider" />
          <div>
            <div className="hero-value num">
              {lessonsDone} / {lessonsTotal}
            </div>
            <div className="hero-label">Lessons done</div>
          </div>
        </div>
      </section>

      <p className="label section-label">Courses</p>

      {student.courses.length === 0 && (
        <section className="empty">
          <p className="empty-title">No courses yet</p>
          <p>This student's class has no courses assigned.</p>
        </section>
      )}

      {student.courses.map((c) => {
        const studyingNow = online && entry.course && entry.course.id === c.id;
        const lastWorked =
          !studyingNow &&
          student.current_course &&
          student.current_course.id === c.id;
        return (
          <section className="card course-card" key={c.id}>
            <div className="course-top">
              <div className="course-title">
                <h3>{courseLabel(c, student.courses)}</h3>
                {studyingNow && (
                  <span className="pill pill-live">Studying now</span>
                )}
                {lastWorked && (
                  <span className="pill pill-cold">Last worked on</span>
                )}
              </div>
              {c.rank ? (
                <span className="pill num">
                  <Trophy size={13} />#{c.rank} of {c.class_size}
                </span>
              ) : (
                <span className="pill pill-cold">No XP yet</span>
              )}
            </div>
            <ProgressBar value={c.progress} />
            <div className="course-meta">
              <span className="num">
                {c.progress}% · {c.completed_lessons} / {c.total_lessons}{" "}
                lessons
              </span>
              <span className="pill num">
                <Zap size={13} />
                {formatXp(c.xp)} XP
              </span>
            </div>
          </section>
        );
      })}
    </>
  );
}
