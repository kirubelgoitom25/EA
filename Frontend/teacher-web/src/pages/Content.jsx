import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ListChecks } from "lucide-react";
import { api } from "../lib/api.js";

export default function Content() {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("/courses")
      .then((data) => {
        if (active) setCourses(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="label">Course content</p>
          <h1>Lessons</h1>
        </div>
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {!error && courses === null && (
        <>
          <div className="skeleton tall" />
          <div className="skeleton tall" />
        </>
      )}

      {courses && courses.length === 0 && (
        <section className="empty">
          <p className="empty-title">No courses yet</p>
          <p>Courses show up here once one of your classes has a course.</p>
        </section>
      )}

      {courses &&
        courses.map((course) => (
          <section className="card content-course" key={course.id}>
            <div className="card-head">
              <div className="who">
                <span className="name">{course.title}</span>
                <span className="sub">{course.description}</span>
              </div>
            </div>
            {course.modules.map((module) => (
              <div key={module.id}>
                <p className="module-label">{module.title}</p>
                {module.lessons.length === 0 && (
                  <p className="empty-inline">No lessons in this module.</p>
                )}
                {module.lessons.map((lesson) => (
                  <Link
                    className="row row-link"
                    to={`/content/lessons/${encodeURIComponent(lesson.id)}/quiz`}
                    key={lesson.id}
                  >
                    <div className="who">
                      <span className="name">{lesson.title}</span>
                    </div>
                    <span className="pill">
                      <ListChecks size={13} />
                      Quiz
                    </span>
                    <ChevronRight size={20} className="chev" />
                  </Link>
                ))}
              </div>
            ))}
          </section>
        ))}
    </>
  );
}
