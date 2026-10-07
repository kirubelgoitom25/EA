import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "../lib/api.js";

export default function Classes() {
  const [classes, setClasses] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("/classes")
      .then((data) => {
        if (active) setClasses(data);
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
          <p className="label">Teacher dashboard</p>
          <h1>Your classes</h1>
        </div>
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {!error && classes === null && (
        <div className="grid">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {classes && classes.length === 0 && (
        <section className="empty">
          <p className="empty-title">No class linked yet</p>
          <p>Ask the admin to add you to a class. It will show up here.</p>
        </section>
      )}

      {classes && classes.length > 0 && (
        <div className="grid">
          {classes.map((c) => (
            <section className="card class-card" key={c.id}>
              <h2>{c.name}</h2>
              <span className="pill num">
                <Users size={13} />
                {c.student_count} students
              </span>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
