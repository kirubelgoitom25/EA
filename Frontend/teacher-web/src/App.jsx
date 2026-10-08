import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import Shell from "./components/Shell.jsx";
import Login from "./pages/Login.jsx";
import Classes from "./pages/Classes.jsx";
import ClassPage from "./pages/ClassPage.jsx";
import StudentPage from "./pages/StudentPage.jsx";
import Rankings from "./pages/Rankings.jsx";
import "./App.css";

// The route guard is for convenience only. The backend checks the token on every request.
function Protected() {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen message="Loading your dashboard…" />;
  if (!profile) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route element={<Shell />}>
              <Route path="/" element={<Navigate to="/classes" replace />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/classes/:classId" element={<ClassPage />} />
              <Route path="/students/:studentId" element={<StudentPage />} />
              <Route path="/rankings" element={<Rankings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
