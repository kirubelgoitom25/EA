import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Alert,
  AppState,
  BackHandler,
} from "react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque";

import LoginScreen from "./components/LoginScreen";
import HomeScreen from "./components/HomeScreen";
import ProfileScreen from "./components/ProfileScreen";
import CoursesScreen from "./components/CoursesScreen";
import ExploreScreen from "./components/ExploreScreen";
import CourseScreen from "./components/CourseScreen";
import RankingScreen from "./components/RankingScreen";
import ChapterPathScreen from "./components/ChapterPathScreen";
import ActivityScreen from "./components/ActivityScreen";
import JourneyMoment from "./components/JourneyMoment";
import StageSession from "./components/session/StageSession";
import { flattenChapters, nextChapter } from "./components/session/sessionModel";
import { loadMyCourseIds, saveMyCourseIds } from "./services/myCourses";

import { supabase } from "./lib/supabase";
import {
  loginUser,
  logoutUser,
  restoreSession,
  fetchStudent,
  fetchCourses,
  fetchRanking,
  sendHeartbeat,
  fetchLessonActivities,
} from "./services/api";
import { buildSteps } from "./services/activitySteps";
import { hasSeen, markSeen } from "./services/journey";
import { chapterWord, isFreshCourse } from "./services/journeyModel";
import { useTheme } from "./theme";
import {
  HOME,
  LOGIN,
  back,
  currentScreen,
  push,
  switchTab,
} from "./navigation";

const EMPTY_RANKING = { entries: [], yourPosition: null, yourXp: 0 };

export default function App() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Inter is the EA typeface. If it fails to load the app still works,
  // with the system font.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    BricolageGrotesque_700Bold,
  });

  const [user, setUser] = useState(null);
  // Screen history (see navigation.js). The last entry is on screen.
  const [stack, setStack] = useState([LOGIN]);
  const screen = currentScreen(stack);
  const [restoring, setRestoring] = useState(true);

  const [student, setStudent] = useState(null);
  const [courses, setCourses] = useState([]);
  const [ranking, setRanking] = useState(EMPTY_RANKING);
  const [rankingScope, setRankingScope] = useState("class");
  const [rankingPeriod, setRankingPeriod] = useState("weekly");
  const [loadingData, setLoadingData] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  // A video or reading of the open chapter (Course Studio).
  const [selectedActivity, setSelectedActivity] = useState(null);
  // Where that activity sits in its chapter, and what follows it (set when it is opened).
  const [activityTrail, setActivityTrail] = useState({ context: null, next: null });
  // Stage to open (index), or null for "the next one not done".
  const [selectedStage, setSelectedStage] = useState(null);
  // Courses added to "Your courses" (saved on the phone; null = loading).
  const [myCourseIds, setMyCourseIds] = useState(null);

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
    setSelectedStage(null);
    setMyCourseIds(null);
    setStack([LOGIN]);
  }, []);

  // On launch: if a saved session exists, skip the login screen.
  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then((restoredUser) => {
        if (!cancelled && restoredUser) {
          setUser(restoredUser);
          setStack([HOME]);
        }
      })
      .catch((error) => {
        if (error?.accountOff) {
          Alert.alert("Account turned off", error.message);
        }
      })
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
        setStack([LOGIN]);
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
          ? (coursesData.find((course) => course.id === current.id) ?? current)
          : current,
      );
    } catch (error) {
      // Keep the current data on screen, unless the account was turned off.
      if (error?.accountOff) {
        Alert.alert("Account turned off", error.message);
      }
    } finally {
      refreshInFlight.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        refreshProgress();
      }
    }
  }, [rankingScope, rankingPeriod]);
  // Presence: while a student is logged in and the app is open, tell the
  // server every 45 seconds, and say which chapter (lesson) is open, if any.
  // It stops when the app goes to the background or the student logs out.
  const heartbeatLessonId = screen === "path" || screen === "stage" || screen === "activity"
    ? (selectedLesson?.id ?? null)
    : null;

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let timer = null;
    const beat = () => sendHeartbeat(heartbeatLessonId);
    const start = () => {
      beat();
      timer = setInterval(beat, 45000);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (AppState.currentState === "active") {
      start();
    }

    const subscription = AppState.addEventListener("change", (state) => {
      stop();
      if (state === "active") {
        start();
      }
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [user, heartbeatLessonId]);

  // Screens that show server data. Arriving on one fetches fresh data, as
  // switching screens always has.
  const DATA_SCREENS = ["home", "courses", "explore", "course", "path", "ranking", "profile"];

  const showScreen = (nextStack) => {
    const target = currentScreen(nextStack);
    if (target !== screen && DATA_SCREENS.includes(target)) {
      refreshProgress();
    }
    setStack(nextStack);
  };

  // Bottom-nav tabs start a fresh history.
  const goTo = (tab) => showScreen(switchTab(stack, tab));

  const openScreen = (target) => showScreen(push(stack, target));

  // One step back. The on-screen back buttons and Android's back button use
  // the same history, so they always agree.
  const goBack = () => {
    const result = back(stack);
    if (result.handled) {
      showScreen(result.stack);
    }
    return result.handled;
  };

  // Android hardware back. Not handled on Home or Login, so the system
  // closes the app as usual there.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;

  useEffect(() => {
    if (!user) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => goBackRef.current(),
    );
    return () => subscription.remove();
  }, [user]);

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
      setStack([HOME]);
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
    [rankingPeriod],
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
    [rankingScope],
  );

  // "Your courses": loaded once the course list is known. The first time,
  // courses with progress are added automatically (see services/myCourses).
  useEffect(() => {
    if (!user || !student || myCourseIds !== null) return;
    let cancelled = false;
    loadMyCourseIds(user.id, courses).then((ids) => {
      if (!cancelled) setMyCourseIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [user, student, courses, myCourseIds]);

  const setMine = (ids) => {
    setMyCourseIds(ids);
    saveMyCourseIds(user.id, ids);
  };
  const isMine = (courseId) => (myCourseIds ?? []).includes(courseId);
  const addCourse = (courseId) => {
    if (!isMine(courseId)) setMine([...(myCourseIds ?? []), courseId]);
  };
  const toggleCourse = (courseId) =>
    isMine(courseId)
      ? setMine((myCourseIds ?? []).filter((id) => id !== courseId))
      : addCourse(courseId);

  // A course not begun yet opens on its introduction (once); otherwise on its journey path.
  const openCourse = async (course) => {
    let intro = false;
    try {
      intro = isFreshCourse(course) && !(await hasSeen(user.id, "intro", course.id));
    } catch (error) {
      // keep the path
    }
    setSelectedCourse(course);
    openScreen(intro ? "intro" : "course");
  };

  // "Start Journey": the course joins "Your courses" and the path replaces the introduction.
  const startJourney = () => {
    markSeen(user.id, "intro", selectedCourse.id);
    addCourse(selectedCourse.id);
    showScreen([...stack.slice(0, -1), "course"]);
  };

  // A chapter opens as its path of stages.
  const openLesson = (lesson) => {
    setSelectedLesson(lesson);
    openScreen("path");
  };

  // Opens a video or a reading of the chapter.
  const openActivity = (activity, trail = { context: null, next: null }) => {
    setSelectedActivity(activity);
    setActivityTrail(trail);
    openScreen("activity");
  };

  // From a finished video or reading to what comes next, without going back to the path.
  const goToNext = (next) => {
    if (next.type === "questions") {
      setSelectedStage(null);
      showScreen([...stack.slice(0, -1), "stage"]);
      return;
    }
    setActivityTrail(activityTrail.follow ? activityTrail.follow(next.activity) : { context: null, next: null });
    setSelectedActivity(next.activity);
  };

  // Opens a stage (index, or null = the next one not done). Starting a
  // stage adds the course to "Your courses".
  const openStage = (stageIndex) => {
    if (selectedCourse) addCourse(selectedCourse.id);
    setSelectedStage(stageIndex);
    if (screen !== "stage") openScreen("stage");
  };

  // Home's Continue: straight into the next stage, with the course and the
  // chapter path underneath so going back lands on them.
  // A chapter with a video or reading still to do, or with no questions at all, opens on its
  // path instead, so those steps are not skipped. If its activities can't be loaded, behave as
  // before and go straight to the stage.
  const continueChapter = async (course, lesson) => {
    // A course not begun yet starts with its introduction.
    try {
      if (isFreshCourse(course) && !(await hasSeen(user.id, "intro", course.id))) {
        setSelectedCourse(course);
        showScreen([...stack, "intro"]);
        return;
      }
    } catch (error) {
      // go on to the chapter
    }
    let straightToStage = true;
    try {
      const steps = buildSteps((await fetchLessonActivities(lesson.id)).activities);
      const hasQuestions = steps.some((step) => step.type === "questions");
      const ownStepToDo = steps.some((step) => step.type !== "questions" && !step.activity.completed);
      straightToStage = hasQuestions && !ownStepToDo;
    } catch (error) {
      // keep the shortcut
    }
    setSelectedCourse(course);
    setSelectedLesson(lesson);
    setSelectedStage(null);
    showScreen([...stack, "course", "path", ...(straightToStage ? ["stage"] : [])]);
  };

  // The selected chapter as it is in the latest course data (so "done"
  // updates after a submit).
  const currentLesson =
    flattenChapters(selectedCourse).find((lesson) => lesson.id === selectedLesson?.id) ??
    selectedLesson;

  // Shown on a back link: the screen you'd return to.
  const BACK_LABELS = { home: "Home", courses: "Courses", explore: "Explore" };
  const previousScreen = stack[stack.length - 2];
  const backLabel =
    previousScreen === "course" ? selectedCourse?.title : BACK_LABELS[previousScreen];

  const myCourses = courses.filter((course) => isMine(course.id));

  const rankingEntries = Array.isArray(ranking?.entries) ? ranking.entries : [];

  if (restoring || (!fontsLoaded && !fontError)) {
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
        userId={user.id}
        user={student}
        courses={myCourses}
        availableCount={courses.length}
        ranking={rankingEntries}
        {...navProps}
        onExplore={() => openScreen("explore")}
        onSelectCourse={openCourse}
        onContinueChapter={continueChapter}
      />
    );
  }

  if (screen === "profile") {
    return (
      <ProfileScreen
        user={student}
        ranking={rankingEntries}
        onBack={goBack}
        onLogout={handleLogout}
        {...navProps}
      />
    );
  }

  if (screen === "courses") {
    return (
      <CoursesScreen
        courses={courses}
        myCourseIds={myCourseIds ?? []}
        onExplore={() => openScreen("explore")}
        onSelectCourse={openCourse}
        {...navProps}
      />
    );
  }

  if (screen === "explore") {
    return (
      <ExploreScreen
        courses={courses}
        myCourseIds={myCourseIds ?? []}
        onAddCourse={addCourse}
        onSelectCourse={openCourse}
        onBack={goBack}
        backLabel={backLabel}
        onCourses={navProps.onCourses}
      />
    );
  }

  if (screen === "course") {
    return (
      <CourseScreen
        userId={user.id}
        course={selectedCourse}
        isMine={isMine(selectedCourse.id)}
        onToggleMine={() => toggleCourse(selectedCourse.id)}
        backLabel={backLabel}
        onSelectLesson={openLesson}
        onBack={goBack}
        {...navProps}
      />
    );
  }

  if (screen === "intro" && selectedCourse) {
    return (
      <JourneyMoment
        key={selectedCourse.id}
        course={selectedCourse}
        overline="A NEW JOURNEY"
        title={selectedCourse.title}
        body={
          selectedCourse.description ||
          "Chapter by chapter, I'll show you the way. Ready when you are."
        }
        chapters={flattenChapters(selectedCourse).length}
        done={0}
        caption={`${flattenChapters(selectedCourse).length} ${chapterWord(flattenChapters(selectedCourse).length)} to the den`}
        buttonLabel="Start Journey"
        onPress={startJourney}
        onBack={goBack}
      />
    );
  }

  if (screen === "path") {
    return (
      <ChapterPathScreen
        key={currentLesson.id}
        userId={user.id}
        course={selectedCourse}
        chapterNumber={
          flattenChapters(selectedCourse).findIndex((lesson) => lesson.id === currentLesson.id) + 1 || null
        }
        chapterCount={flattenChapters(selectedCourse).length}
        lesson={currentLesson}
        onBack={goBack}
        onOpenStage={openStage}
        onOpenActivity={openActivity}
        onComplete={refreshProgress}
      />
    );
  }

  if (screen === "activity" && selectedActivity) {
    // Nothing left in this chapter: on to the next chapter, or, at the end of the course, the journey.
    const upNextChapter = nextChapter(selectedCourse, currentLesson?.id);
    const closing = upNextChapter
      ? {
          label: "Next chapter",
          onPress: () => {
            setSelectedLesson(upNextChapter);
            showScreen(stack.slice(0, -1)); // to the next chapter's path
          },
        }
      : {
          label: "See my journey",
          onPress: () => {
            const at = stack.lastIndexOf("course");
            showScreen(at >= 0 ? stack.slice(0, at + 1) : [...stack.slice(0, -2), "course"]);
          },
        };
    return (
      <ActivityScreen
        key={selectedActivity.id}
        activity={selectedActivity}
        context={activityTrail.context}
        next={activityTrail.next}
        onNext={goToNext}
        closing={closing}
        onBack={goBack}
        // The server completed the lesson too: refresh so the course shows it.
        onCompleted={refreshProgress}
      />
    );
  }

  if (screen === "stage") {
    const upNext = nextChapter(selectedCourse, currentLesson?.id);
    return (
      <StageSession
        // A new chapter or stage starts fresh.
        key={`${currentLesson.id}-${selectedStage}`}
        userId={user.id}
        lesson={currentLesson}
        stageIndex={selectedStage}
        hasNextChapter={!!upNext}
        onExit={goBack}
        onOpenStage={openStage}
        onNextChapter={() => {
          if (!upNext) return;
          setSelectedLesson(upNext);
          showScreen(stack.slice(0, -1)); // to the next chapter's path
        }}
        onComplete={refreshProgress}
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
        onBack={goBack}
        onRefresh={refreshProgress}
        {...navProps}
      />
    );
  }

  return null;
}

const createStyles = (colors) =>
  StyleSheet.create({
    loadingScreen: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.screenBg,
    },
  });
