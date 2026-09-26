import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import LoginScreen from "./components/LoginScreen";
import HomeScreen from "./components/HomeScreen";
import ProfileScreen from "./components/ProfileScreen";
import CoursesScreen from "./components/CoursesScreen";
import CourseScreen from "./components/CourseScreen";
import LessonScreen from "./components/LessonScreen";
import QuizScreen from "./components/QuizScreen";
import RankingScreen from "./components/RankingScreen";
import PracticeScreen from "./components/PracticeScreen";

import {
  loginUser,
  logoutUser,
  fetchStudent,
  fetchCourses,
  addXp,
  markLessonCompleted,
  recordQuizAttempt,
  recordPracticeAttempt,
} from "./services/api";

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("login");

  const [student, setStudent] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [completedLessons, setCompletedLessons] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  // How many times each lesson's quiz has been completed —
  // drives the diminishing XP rate on retries.
  const [lessonAttempts, setLessonAttempts] = useState({});

  // Once logged in, load the student profile and course list.
  // Today this resolves instantly from mock data; once the api.js
  // functions call Supabase for real, nothing here needs to change.
  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    setLoadingData(true);

    Promise.all([fetchStudent(), fetchCourses()])
      .then(([studentData, coursesData]) => {
        if (cancelled) {
          return;
        }
        setStudent(studentData);
        setCourses(coursesData);
      })
      .catch((error) => {
        console.error("Failed to load student data:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingData(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Shared navigation props for the bottom nav bar, used on
  // every main screen so it stays consistent everywhere.
  const navProps = {
    onHome: () => setScreen("home"),
    onCourses: () => setScreen("courses"),
    onRanking: () => setScreen("ranking"),
    onProfile: () => setScreen("profile"),
  };

  const handleLogin = async (credentials) => {
    try {
      const loggedInUser = await loginUser(
        credentials.email,
        credentials.password
      );
      setUser(loggedInUser);
      setScreen("home");
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setStudent(null);
    setCourses([]);
    setCompletedLessons([]);
    setScreen("login");
  };

  const openCourse = (course) => {
    setSelectedCourse(course);
    setScreen("course");
  };

  const openLesson = (lesson) => {
    setSelectedLesson(lesson);
    setScreen("lesson");
  };

  const openQuiz = () => {
    setScreen("quiz");
  };

  const openPractice = () => {
    setScreen("practice");
  };

  // Shared logic: award XP and mark a lesson's progress. Used by
  // both the quiz and practice completion handlers below.
  const markLessonProgress = (xpEarned, source) => {
    if (!selectedLesson || !student) {
      return;
    }

    setStudent((currentStudent) => ({
      ...currentStudent,
      xp: currentStudent.xp + xpEarned,
    }));

    // Fire-and-forget writes through the api layer. Today these
    // are no-op mocks; once Supabase is wired in, this is where
    // the real persistence happens — the screens above never need
    // to know the difference.
    addXp(student.id, xpEarned, source).catch((error) =>
      console.error("Failed to record XP:", error)
    );

    const alreadyCompleted = completedLessons.includes(selectedLesson.id);

    if (!alreadyCompleted) {
      setCompletedLessons((current) => [...current, selectedLesson.id]);
      markLessonCompleted(selectedLesson.id).catch((error) =>
        console.error("Failed to mark lesson completed:", error)
      );
    }

    // Build the updated courses list once, up front, instead of
    // mutating other state from inside setCourses' updater function.
    let updatedSelectedCourse = null;

    const nextCourses = courses.map((course) => {
      const hasLesson = course.modules.some((module) =>
        module.lessons.some((lesson) => lesson.id === selectedLesson.id)
      );

      if (!hasLesson) {
        return course;
      }

      const updatedModules = course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) =>
          lesson.id === selectedLesson.id
            ? { ...lesson, completed: true }
            : lesson
        ),
      }));

      const totalLessons = updatedModules.reduce(
        (total, module) => total + module.lessons.length,
        0
      );

      const completedLessonsCount = updatedModules.reduce(
        (total, module) =>
          total +
          module.lessons.filter((lesson) => lesson.completed).length,
        0
      );

      const updatedCourse = {
        ...course,
        modules: updatedModules,
        totalLessons,
        completedLessons: completedLessonsCount,
        progress:
          totalLessons > 0
            ? Math.round((completedLessonsCount / totalLessons) * 100)
            : 0,
      };

      updatedSelectedCourse = updatedCourse;
      return updatedCourse;
    });

    setCourses(nextCourses);

    if (updatedSelectedCourse) {
      setSelectedCourse(updatedSelectedCourse);
    }
  };

  // Quiz completions also track the attempt count, which drives
  // the diminishing XP rate on retries (10 / 5 / 2.5 / 1).
  const completeQuiz = (xpEarned, score) => {
    if (!selectedLesson || !student) {
      return;
    }

    setLessonAttempts((current) => ({
      ...current,
      [selectedLesson.id]: (current[selectedLesson.id] || 0) + 1,
    }));

    recordQuizAttempt(student.id, selectedLesson.id, score, xpEarned).catch(
      (error) => console.error("Failed to record quiz attempt:", error)
    );

    markLessonProgress(xpEarned, "quiz");
  };

  // Practice completions don't affect the quiz's attempt count.
  const completePractice = (xpEarned, score) => {
    if (!selectedLesson || !student) {
      return;
    }

    recordPracticeAttempt(student.id, selectedLesson.id, score, xpEarned).catch(
      (error) => console.error("Failed to record practice attempt:", error)
    );

    markLessonProgress(xpEarned, "practice");
  };

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (loadingData || !student) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#58cc02" />
      </View>
    );
  }

  if (screen === "home") {
    return (
      <HomeScreen
        user={student}
        courses={courses}
        {...navProps}
        onSelectCourse={openCourse}
        onLogout={handleLogout}
      />
    );
  }

  if (screen === "profile") {
    return (
      <ProfileScreen
        user={student}
        onBack={() => setScreen("home")}
        onLogout={handleLogout}
        {...navProps}
      />
    );
  }

  if (screen === "courses") {
    return (
      <CoursesScreen
        courses={courses}
        onSelectCourse={openCourse}
        onBack={() => setScreen("home")}
        {...navProps}
      />
    );
  }

  if (screen === "course") {
    return (
      <CourseScreen
        course={selectedCourse}
        onSelectLesson={openLesson}
        onBack={() => setScreen("courses")}
        {...navProps}
      />
    );
  }

  if (screen === "lesson") {
    return (
      <LessonScreen
        lesson={selectedLesson}
        onBack={() => setScreen("course")}
        onQuiz={openQuiz}
        onPractice={openPractice}
        {...navProps}
      />
    );
  }

  if (screen === "practice") {
    return (
      <PracticeScreen
        lesson={selectedLesson}
        onBack={() => setScreen("lesson")}
        onComplete={completePractice}
        {...navProps}
      />
    );
  }

  if (screen === "quiz") {
    return (
      <QuizScreen
        lesson={selectedLesson}
        attemptNumber={(lessonAttempts[selectedLesson.id] || 0) + 1}
        onBack={() => setScreen("lesson")}
        onComplete={completeQuiz}
        {...navProps}
      />
    );
  }

  if (screen === "ranking") {
    return (
      <RankingScreen
        student={student}
        onBack={() => setScreen("home")}
        {...navProps}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f7f9fc",
  },
});
