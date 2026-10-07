import { Link, Outlet, useLocation } from "react-router-dom";
import { LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Shell() {
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const classesActive =
    pathname.startsWith("/classes") || pathname.startsWith("/students");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">EA</span>
          <span>Teachers</span>
        </div>
        <nav>
          <Link
            to="/classes"
            className={`nav-item${classesActive ? " active" : ""}`}
          >
            <LayoutGrid size={20} />
            <span>Classes</span>
          </Link>
        </nav>
        <button className="nav-item" onClick={signOut}>
          <LogOut size={20} />
          <span>Sign out</span>
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
