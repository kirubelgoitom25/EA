import { NavLink, Outlet } from "react-router-dom";
import { LayoutGrid, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Shell() {
  const { signOut } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">EA</span>
          <span>Teachers</span>
        </div>
        <nav>
          <NavLink to="/" end className="nav-item">
            <LayoutGrid size={20} />
            <span>Classes</span>
          </NavLink>
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
