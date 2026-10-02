import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, ActivityIndicator, StyleSheet, Alert, LogBox } from "react-native";

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
import { useTheme } from "./theme";

LogBox.ignoreAllLogs();

const EMPTY_RANKING = { entries: [], yourPosition: null, yourXp: 0 };

export default function App() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("login");
  const [restoring, setRestoring] = useState(true);

  const [student, setStudent] = useState(null);
  const [courses, setCourses] = useState([]);
  const [ranking, setRanking] = useState(EMPTY_RANKING);
  const [rankingScope, setRankingScope] = useState("class");
  const [rankingPeriod, setRankingPeriod] = useState("weekly");
  const [loadingData, setLoadingData] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  // Used by refreshProgress (see below).
  const loggedIn = useRef(false);
  const currentUserId = useRef(null);
  const rankingRequestId = useRef(0);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);

  useEffect(() => {
    loggedIn.current = !!user;
    currentUserId.current = user?.id ?? null;
  }, [user]);

  const resetToLogin = useCallback(() => {
    loggedIn.current = false;
    currentUserId.current = null;
    rankingRequestId.current += 1;
    refreshQueued.current = false;
    setUser(null);
    setStudent(null);
    setCourses([]);
    setRanking(EMPTY_RANKING);
    setRankingScope("class");
    setRankingPeriod("weekly");
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

    Promise.all([
      fetchStudent(),
      fetchCourses(),
      fetchRanking(rankingScope, rankingPeriod),
    ])
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

  // Ask the server what's true now. XP, streak, ranking and lesson
  // checkmarks all come from the server.
  //
  // Called after a quiz/practice is recorded, every time the user switches
  // screens, and on pull-to-refresh. If a refresh is already running, we
  // remember to run exactly one more when it finishes instead of sending
  // requests in parallel. A failed refresh keeps what's on screen: it never
  // clears data or logs the user out.
  const refreshProgress = useCallback(async () => {
    const requestedUserId = currentUserId.current;
    if (!requestedUserId) return;
    const rankingRequest = ++rankingRequestId.current;
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }

    refreshInFlight.current = true;
    try {
      const [studentData, coursesData, rankingData] = await Promise.all([
        fetchStudent(),
        fetchCourses(),
        fetchRanking(rankingScope, rankingPeriod),
      ]);

      if (!loggedIn.current) {
        return; // logged out while this was loading
      }

      if (currentUserId.current !== requestedUserId) return;

      setStudent(studentData);
      setCourses(coursesData);
      if (rankingRequestId.current === rankingRequest) {
        setRanking(rankingData);
      }
      setSelectedCourse((current) =>
        current
          ? coursesData.find((course) => course.id === current.id) ?? current
          : current
      );
    } catch (error) {
      // Keep the current data on screen.
    } finally {
      refreshInFlight.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        refreshProgress();
      }
    }
  }, [rankingScope, rankingPeriod]);

  // Switch screens, and fetch fresh data whenever the screen actually changes.
  const goTo = (target) => {
    if (target !== screen) {
      refreshProgress();
    }
    setScreen(target);
  };

  const navProps = {
    onHome: () => goTo("home"),
    onCourses: () => goTo("courses"),
    onRanking: () => goTo("ranking"),
    onProfile: () => goTo("profile"),
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

  const onRankingScopeChange = useCallback(
    async (scope) => {
      const requestedUserId = currentUserId.current;
      if (!requestedUserId) return;
      const requestId = ++rankingRequestId.current;
      setRankingScope(scope);
      try {
        const result = await fetchRanking(scope, rankingPeriod);
        if (
          currentUserId.current === requestedUserId &&
          rankingRequestId.current === requestId
        ) {
          setRanking(result);
        }
      } catch (error) {
        if (
          currentUserId.current === requestedUserId &&
          rankingRequestId.current === requestId
        ) {
          Alert.alert("Couldn't load ranking", error.message);
        }
      }
    },
    [rankingPeriod]
  );

  const onRankingPeriodChange = useCallback(
    async (period) => {
      const requestedUserId = currentUserId.current;
      if (!requestedUserId) return;
      const requestId = ++rankingRequestId.current;
      setRankingPeriod(period);
      try {
        const result = await fetchRanking(rankingScope, period);
        if (
          currentUserId.current === requestedUserId &&
          rankingRequestId.current === requestId
        ) {
          setRanking(result);
        }
      } catch (error) {
        if (
          currentUserId.current === requestedUserId &&
          rankingRequestId.current === requestId
        ) {
          Alert.alert("Couldn't load ranking", error.message);
        }
      }
    },
    [rankingScope]
  );

  const openCourse = (course) => {
    setSelectedCourse(course);
    setScreen("course");
  };

  const openLesson = (lesson) => {
    setSelectedLesson(lesson);
    setScreen("lesson");
  };

  const rankingEntries = Array.isArray(ranking?.entries)
    ? ranking.entries
    : [];

  if (restoring) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (loadingData || !student) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

  if (screen === "home") {
    return (
      <HomeScreen
        user={student}
        courses={courses}
        ranking={rankingEntries}
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
        ranking={rankingEntries}
        onBack={() => goTo("home")}
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
        onBack={() => goTo("home")}
        {...navProps}
      />
    );
  }

  if (screen === "course") {
    return (
      <CourseScreen
        course={selectedCourse}
        onSelectLesson={openLesson}
        onBack={() => goTo("courses")}
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
        ranking={rankingEntries}
        yourPosition={ranking?.yourPosition ?? null}
        yourXp={ranking?.yourXp ?? 0}
        rankingScope={rankingScope}
        onRankingScopeChange={onRankingScopeChange}
        rankingPeriod={rankingPeriod}
        onRankingPeriodChange={onRankingPeriodChange}
        onBack={() => goTo("home")}
        onRefresh={refreshProgress}
        {...navProps}
      />
    );
  }

  return null;
}

const createStyles = (colors) => StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.screenBg,
  },
});