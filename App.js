import React, { useState } from "react";

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
  student as initialStudent,
  courses as initialCourses,
} from "./data/mockData";

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("login");

  const [student, setStudent] = useState(initialStudent);
  const [courses, setCourses] = useState(initialCourses);
  const [completedLessons, setCompletedLessons] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  // How many times each lesson's quiz has been completed —
  // drives the diminishing XP rate on retries.
  const [lessonAttempts, setLessonAttempts] = useState({});

  // Shared navigation props for the bottom nav bar, used on
  // every main screen so it stays consistent everywhere.
  const navProps = {
    onHome: () => setScreen("home"),
    onCourses: () => setScreen("courses"),
    onRanking: () => setScreen("ranking"),
    onProfile: () => setScreen("profile"),
  };

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    setScreen("home");
  };

  const handleLogout = () => {
    setUser(null);
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
  const markLessonProgress = (xpEarned) => {
    if (!selectedLesson) {
      return;
    }

    setStudent((currentStudent) => ({
      ...currentStudent,
      xp: currentStudent.xp + xpEarned,
    }));

    const alreadyCompleted = completedLessons.includes(selectedLesson.id);

    if (!alreadyCompleted) {
      setCompletedLessons((current) => [...current, selectedLesson.id]);
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
  const completeQuiz = (xpEarned) => {
    if (!selectedLesson) {
      return;
    }

    setLessonAttempts((current) => ({
      ...current,
      [selectedLesson.id]: (current[selectedLesson.id] || 0) + 1,
    }));

    markLessonProgress(xpEarned);
  };

  // Practice completions don't affect the quiz's attempt count.
  const completePractice = (xpEarned) => {
    markLessonProgress(xpEarned);
  };

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
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
