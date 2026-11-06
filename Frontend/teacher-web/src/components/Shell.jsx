import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { BookOpen, LayoutGrid, LogOut, PenLine, Receipt, Trophy, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { paymentsApi } from "../lib/paymentsApi.js";
import { PAYMENTS_CHANGED } from "../pages/Payments.jsx";

export default function Shell() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const classesActive =
    pathname.startsWith("/classes") || pathname.startsWith("/students");
  const rankingsActive = pathname.startsWith("/rankings");
  const contentActive = pathname.startsWith("/content");
  const studioActive = pathname.startsWith("/studio");
  const paymentsActive = pathname.startsWith("/payments");
  const peopleActive = pathname.startsWith("/people");
  const [waiting, setWaiting] = useState(0);

  // The count is a convenience, so a failure just leaves it as it was.
  useEffect(() => {
    let live = true;
    const refresh = () =>
      paymentsApi
        .listRequests({ status: "pending", limit: 1 })
        .then((data) => live && setWaiting(data.pending_total))
        .catch(() => {});
    refresh();
    window.addEventListener(PAYMENTS_CHANGED, refresh);
    return () => {
      live = false;
      window.removeEventListener(PAYMENTS_CHANGED, refresh);
    };
  }, [pathname]);

  return (
    <div className={`shell${studioActive || paymentsActive || peopleActive ? " studio-theme" : ""}`}>
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
          <Link
            to="/studio"
            className={`nav-item${studioActive ? " active" : ""}`}
          >
            <PenLine size={20} />
            <span>Studio</span>
          </Link>
          <Link
            to="/payments"
            className={`nav-item${paymentsActive ? " active" : ""}`}
          >
            <Receipt size={20} />
            <span>Payments</span>
            {waiting > 0 && (
              <span className="nav-count" aria-label={`${waiting} waiting`}>{waiting}</span>
            )}
          </Link>
          <Link
            to="/content"
            className={`nav-item${contentActive ? " active" : ""}`}
          >
            <BookOpen size={20} />
            <span>Content</span>
          </Link>
          <Link
            to="/rankings"
            className={`nav-item${rankingsActive ? " active" : ""}`}
          >
            <Trophy size={20} />
            <span>Rankings</span>
          </Link>
          {profile?.is_admin && (
            <Link
              to="/people"
              className={`nav-item${peopleActive ? " active" : ""}`}
            >
              <Users size={20} />
              <span>People</span>
            </Link>
          )}
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
