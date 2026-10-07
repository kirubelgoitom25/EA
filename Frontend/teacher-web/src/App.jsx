import {
  LayoutGrid,
  ClipboardCheck,
  Trophy,
  Flame,
  Zap,
  LogOut,
} from "lucide-react";
import "./App.css";

const students = [
  { name: "Abebe Sample", xp: 420, streak: 7, progress: 82 },
  { name: "Sara Sample", xp: 355, streak: 3, progress: 64 },
  { name: "Dawit Sample", xp: 290, streak: 0, progress: 41 },
];

const initials = (name) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const rankClass = (i) =>
  i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";

export default function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">EA</span>
          <span>Teachers</span>
        </div>
        <nav>
          <a className="nav-item active" href="#">
            <LayoutGrid size={20} />
            Classes
          </a>
          <a className="nav-item" href="#">
            <ClipboardCheck size={20} />
            Attendance
          </a>
          <a className="nav-item" href="#">
            <Trophy size={20} />
            Rankings
          </a>
        </nav>
        <button className="nav-item">
          <LogOut size={20} />
          Sign out
        </button>
      </aside>

      <main className="main">
        <header className="page-head">
          <div>
            <p className="label">Sample data</p>
            <h1>Your classes</h1>
          </div>
          <button className="btn">
            <ClipboardCheck size={18} />
            Take attendance
          </button>
        </header>

        <section className="hero">
          <p className="hero-eyebrow">CLASS A2</p>
          <h2>Sample class</h2>
          <div className="hero-stats">
            <div>
              <div className="hero-value num">62%</div>
              <div className="hero-label">Avg progress</div>
            </div>
            <div className="hero-divider" />
            <div>
              <div className="hero-value num">#1</div>
              <div className="hero-label">Class rank</div>
            </div>
            <div className="hero-divider" />
            <div>
              <div className="hero-value num">5 / 6</div>
              <div className="hero-label">Here today</div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="label">Roster</h2>
            <span className="pill">{students.length} students</span>
          </div>
          {students.map((s, i) => (
            <div className="row" key={s.name}>
              <span className={`rank ${rankClass(i)}`}>{i + 1}</span>
              <span className="avatar">{initials(s.name)}</span>
              <span className="name">{s.name}</span>
              <div className="track">
                <div className="fill" style={{ width: `${s.progress}%` }} />
              </div>
              <span className="pill num">
                <Zap size={13} />
                {s.xp} XP
              </span>
              <span className={`pill num ${s.streak === 0 ? "pill-cold" : ""}`}>
                <Flame size={13} />
                {s.streak}
              </span>
            </div>
          ))}
        </section>

        <section className="empty">
          <p className="empty-title">
            Empty state example: no class linked yet
          </p>
          <p>Ask the admin to add you to a class. It will show up here.</p>
        </section>
      </main>
    </div>
  );
}
