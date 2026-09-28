import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet, Alert } from "react-native";

import LoginScreen from "./components/LoginScreen";
import HomeScreen from "./components/HomeScreen";
import ProfileScreen from "./components/ProfileScreen";
import CoursesScreen from "./components/CoursesScreen";
import CourseScreen from "./components/CourseScreen";
import LessonScreen from "./components/LessonScreen";
import QuizScreen from "./components/QuizScreen";
import RankingScreen from "./components/RankingScreen";
import PracticeScreen from "./components/PracticeScreen";

import { supabase } from "./lib/supabase";
import {
  loginUser,
  logoutUser,
  restoreSession,
  fetchStudent,
  fetchCourses,
  fetchRanking,
} from "./services/api";

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("login");
  const [restoring, setRestoring] = useState(true);

  const [student, setStudent] = useState(null);
  const [courses, setCourses] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  const resetToLogin = useCallback(() => {
    setUser(null);
    setStudent(null);
    setCourses([]);
    setRanking([]);
    setSelectedCourse(null);
    setSelectedLesson(null);
    setScreen("login");
  }, []);

  // On launch: if a saved session exists, skip the login screen.
  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then((restoredUser) => {
        if (!cancelled && restoredUser) {
          setUser(restoredUser);
          setScreen("home");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setRestoring(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Any sign-out (logout button, or the server rejecting an expired
  // session) sends the app back to the login screen.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        resetToLogin();
      }
    });

    return () => data.subscription.unsubscribe();
  }, [resetToLogin]);

  // Once logged in, load everything the app shows from the server.
  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    setLoadingData(true);

    Promise.all([fetchStudent(), fetchCourses(), fetchRanking()])
      .then(([studentData, coursesData, rankingData]) => {
        if (cancelled) {
          return;
        }
        setStudent(studentData);
        setCourses(coursesData);
        setRanking(rankingData);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        Alert.alert("Couldn't load your data", error.message);
        setUser(null);
        setScreen("login");
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

  // After the server records a quiz or practice, ask it what's true now.
  // XP, streak, ranking and lesson checkmarks all come from the server.
  const refreshProgress = useCallback(async () => {
    try {
      const [studentData, coursesData, rankingData] = await Promise.all([
        fetchStudent(),
        fetchCourses(),
        fetchRanking(),
      ]);
      setStudent(studentData);
      setCourses(coursesData);
      setRanking(rankingData);
      setSelectedCourse((current) =>
        current
          ? coursesData.find((course) => course.id === current.id) ?? current
          : current
      );
    } catch (error) {
      console.error("Failed to refresh progress:", error);
    }
  }, []);

  const navProps = {
    onHome: () => setScreen("home"),
    onCourses: () => setScreen("courses"),
    onRanking: () => setScreen("ranking"),
    onProfile: () => setScreen("profile"),
  };

  const handleLogin = async ({ email, password }) => {
    try {
      const loggedInUser = await loginUser(email.trim(), password);
      setUser(loggedInUser);
      setScreen("home");
    } catch (error) {
      Alert.alert("Login failed", error.message);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
  };

  const openCourse = (course) => {
    setSelectedCourse(course);
    setScreen("course");
  };

  const openLesson = (lesson) => {
    setSelectedLesson(lesson);
    setScreen("lesson");
  };

  if (restoring) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#58cc02" />
      </View>
    );
  }

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
        ranking={ranking}
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
        ranking={ranking}
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
        onQuiz={() => setScreen("quiz")}
        onPractice={() => setScreen("practice")}
        {...navProps}
      />
    );
  }

  if (screen === "practice") {
    return (
      <PracticeScreen
        lesson={selectedLesson}
        onBack={() => setScreen("lesson")}
        onComplete={refreshProgress}
        {...navProps}
      />
    );
  }

  if (screen === "quiz") {
    return (
      <QuizScreen
        lesson={selectedLesson}
        onBack={() => setScreen("lesson")}
        onComplete={refreshProgress}
        {...navProps}
      />
    );
  }

  if (screen === "ranking") {
    return (
      <RankingScreen
        student={student}
        ranking={ranking}
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