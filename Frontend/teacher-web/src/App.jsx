import {
  RouterProvider,
  createBrowserRouter,
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
import Content from "./pages/Content.jsx";
import QuizEditor from "./pages/QuizEditor.jsx";
import PracticeEditor from "./pages/PracticeEditor.jsx";
import StudioDashboard from "./pages/StudioDashboard.jsx";
import CourseEditor from "./pages/CourseEditor.jsx";
import LessonActivities from "./pages/LessonActivities.jsx";
import "./App.css";
import "./studio.css";

// The route guard is for convenience only. The backend checks the token on every request.
function Protected() {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen message="Loading your dashboard…" />;
  if (!profile) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// A data router (not <BrowserRouter>) is needed for useBlocker, which the Studio pages use to
// stop browser Back/Forward and in-app links from silently throwing away unsaved changes.
// The auth provider sits in the root layout so every route still sits inside it.
function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/login", element: <Login /> },
      {
        element: <Protected />,
        children: [
          {
            element: <Shell />,
            children: [
              { path: "/", element: <Navigate to="/classes" replace /> },
              { path: "/classes", element: <Classes /> },
              { path: "/classes/:classId", element: <ClassPage /> },
              { path: "/students/:studentId", element: <StudentPage /> },
              { path: "/rankings", element: <Rankings /> },
              { path: "/studio", element: <StudioDashboard /> },
              { path: "/studio/courses/:courseId", element: <CourseEditor /> },
              {
                path: "/studio/courses/:courseId/lessons/:lessonId",
                element: <LessonActivities />,
              },
              { path: "/content", element: <Content /> },
              { path: "/content/lessons/:lessonId/quiz", element: <QuizEditor /> },
              {
                path: "/content/lessons/:lessonId/practice",
                element: <PracticeEditor />,
              },
            ],
          },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
