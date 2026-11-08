import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  StyleSheet,
  Alert,
  AppState,
  BackHandler,
  Linking,
} from "react-native";
import {
  useFonts,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";

import LoginScreen from "./components/LoginScreen";
import HomeScreen from "./components/HomeScreen";
import ProfileScreen from "./components/ProfileScreen";
import CoursesScreen from "./components/CoursesScreen";
import ExploreScreen from "./components/ExploreScreen";
import CourseScreen from "./components/CourseScreen";
import { forgetPathMotion } from "./components/ui/pathMotionModel";
import LockedCourseScreen from "./components/LockedCourseScreen";
import PurchaseScreen from "./components/PurchaseScreen";
import PaymentRequestsScreen from "./components/PaymentRequestsScreen";
import ProScreen from "./components/ProScreen";
import FinishProfileScreen from "./components/FinishProfileScreen";
import RankingScreen from "./components/RankingScreen";
import ChapterPathScreen, { forgetChapterCache } from "./components/ChapterPathScreen";
import ActivityScreen from "./components/ActivityScreen";
import JourneyMoment from "./components/JourneyMoment";
import StageSession from "./components/session/StageSession";
import BottomNavBar from "./components/BottomNavBar";
import { HomeSkeleton } from "./components/ui/Skeleton";
import { flattenChapters, nextChapter } from "./components/session/sessionModel";
import { loadMyCourseIds, saveMyCourseIds } from "./services/myCourses";
import { isLocked, isProCourse, withPurchased } from "./services/access";
import { isAuthCallback } from "./services/authModel";
import { finishGoogleSignIn, googleSignInInProgress, signInWithGoogle } from "./services/googleAuth";

import { supabase } from "./lib/supabase";
import {
  loginUser,
  registerStudent,
  fetchMe,
  logoutUser,
  signUpUser,
  verifySignUpCode,
  resendSignUpCode,
  sendPasswordResetCode,
  resetPassword,
  restoreSession,
  fetchStats,
  composeStudent,
  fetchCourses,
  fetchRanking,
  sendHeartbeat,
  fetchLessonActivities,
  forgetCachedResponses,
} from "./services/api";
import { isStale } from "./services/responseCache";
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

// Moving between screens refreshes server data only when it is older than this. The
// student's own actions (a submit, Mark complete, a payment) and pull-to-refresh always
// refresh at once, so their own progress is never behind; other people's changes
// (classmates' XP, a new course, an approved payment) show within this time.
const REFRESH_AFTER_MS = 30000;

// Everything the main screens show, in one round of parallel requests.
function loadAppData(scope, period) {
  return Promise.all([fetchStats(), fetchCourses(), fetchRanking(scope, period)]);
}

export default function App() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Plus Jakarta Sans is the EA typeface. If it fails to load the app still works,
  // with the system font.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [user, setUser] = useState(null);
  // The student's EA Pro, refreshed when Pro screens open (a payment can be approved meanwhile).
  const [pro, setPro] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  // Screen history (see navigation.js). The last entry is on screen.
  const [stack, setStack] = useState([LOGIN]);
  const screen = currentScreen(stack);
  const [restoring, setRestoring] = useState(true);
  // Whether the phone has a saved login (null until known): with none, the login screen shows at once.
  const [savedSession, setSavedSession] = useState(null);

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
  // When server data was last loaded (ms), and the login user, for refreshProgress.
  const lastRefreshAt = useRef(0);
  const userRef = useRef(null);
  // Started at launch alongside the session check, so the data does not wait for it.
  const prefetched = useRef(null);

  useEffect(() => {
    loggedIn.current = !!user;
    currentUserId.current = user?.id ?? null;
    userRef.current = user;
  }, [user]);

  const resetToLogin = useCallback(() => {
    forgetPathMotion();
    forgetChapterCache();
    forgetCachedResponses();
    lastRefreshAt.current = 0;
    prefetched.current = null;
    loggedIn.current = false;
    currentUserId.current = null;
    rankingRequestId.current += 1;
    refreshQueued.current = false;
    setUser(null);
    setPro(null);
    setSelectedPlan(null);
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

    // With a saved session, start loading the screens' data now, in parallel with the
    // account check below, instead of after it. If the check fails, the result is dropped.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) setSavedSession(!!session);
        if (session && !cancelled) {
          prefetched.current = {
            userId: session.user?.id,
            data: loadAppData("class", "weekly").catch(() => null),
          };
        }
      })
      .catch(() => {
        if (!cancelled) setSavedSession(false);
      });

    restoreSession()
      .then((restoredUser) => {
        if (!restoredUser) prefetched.current = null;
        if (!cancelled && restoredUser) {
          setUser(restoredUser);
          setPro(restoredUser.pro ?? null);
          setStack([HOME]);
        }
      })
      .catch((error) => {
        prefetched.current = null;
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

  // Android can close the app while the Google sheet is open. It then comes back through this
  // link instead of the sheet's own answer, so the sign-in is finished here.
  useEffect(() => {
    const handle = (url) => {
      if (!isAuthCallback(url) || googleSignInInProgress()) return;
      finishGoogleSignIn(url)
        .then((signedIn) => {
          setUser(signedIn);
          setStack([HOME]);
        })
        .catch((error) => Alert.alert("Couldn't sign in", error.message));
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
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

    // Use what launch started loading, if it was for this very student.
    const early = prefetched.current?.userId === user.id ? prefetched.current.data : null;
    prefetched.current = null;
    (early ?? Promise.resolve(null))
      .then((ready) => ready ?? loadAppData(rankingScope, rankingPeriod))
      .then(([stats, coursesData, rankingData]) => {
        if (cancelled) {
          return;
        }
        setStudent(composeStudent(user, stats));
        setCourses(coursesData);
        setRanking(rankingData);
        lastRefreshAt.current = Date.now();
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
  // Called with no limit after a quiz/practice is recorded, after Mark complete or a
  // payment, and on pull-to-refresh: those always refresh. Called with
  // { ifOlderThan } when switching screens or returning to the app: those refresh only
  // when the data is older than that. If a refresh is already running, we remember to
  // run exactly one more when it finishes instead of sending requests in parallel. A
  // failed refresh keeps what's on screen: it never clears data or logs the user out.
  const refreshProgress = useCallback(async (options) => {
    const requestedUserId = currentUserId.current;
    if (!requestedUserId) return;
    const maxAge = options?.ifOlderThan;
    if (maxAge && (refreshInFlight.current || !isStale(lastRefreshAt.current, maxAge))) return;
    const rankingRequest = ++rankingRequestId.current;
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }

    refreshInFlight.current = true;
    try {
      const [stats, coursesData, rankingData] = await loadAppData(rankingScope, rankingPeriod);

      if (!loggedIn.current) {
        return; // logged out while this was loading
      }

      if (currentUserId.current !== requestedUserId) return;

      lastRefreshAt.current = Date.now();
      setStudent(composeStudent(userRef.current, stats));
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
      refreshProgress({ ifOlderThan: REFRESH_AFTER_MS });
    }
    setStack(nextStack);
  };

  // Back in the app after a while away: catch up, as switching screens would.
  useEffect(() => {
    if (!user) return undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshProgress({ ifOlderThan: REFRESH_AFTER_MS });
    });
    return () => subscription.remove();
  }, [user, refreshProgress]);

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

  const enterApp = (signedIn) => {
    setUser(signedIn);
    setPro(signedIn.pro ?? null);
    setStack([HOME]);
  };

  const handleLogin = async ({ identifier, password }) => {
    try {
      enterApp(await loginUser(identifier.trim(), password));
    } catch (error) {
      if (error.needsConfirmation) return "verify";
      Alert.alert("Login failed", error.message);
    }
    return null;
  };

  // Returns "login" when the account was made but signing in didn't work, so the form switches.
  const handleRegister = async (details) => {
    try {
      enterApp(await registerStudent(details));
      return "signedIn";
    } catch (error) {
      if (/was created/.test(error.message)) return "login";
      Alert.alert("Couldn't create your account", error.message);
      return null;
    }
  };

  // Pro as the server sees it now. A failure keeps what's on screen.
  const refreshPro = () => {
    fetchMe()
      .then((me) => setPro(me.pro))
      .catch(() => {});
  };

  const openPro = () => {
    refreshPro();
    openScreen("pro");
  };

  const handleGoogle = async () => {
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn) enterApp(signedIn); // null: the student closed the sheet
    } catch (error) {
      Alert.alert("Couldn't sign in", error.message);
    }
  };

  const handleSignUp = async (details) => {
    try {
      const { outcome, user: signedIn } = await signUpUser(details);
      if (signedIn) enterApp(signedIn);
      return outcome;
    } catch (error) {
      Alert.alert("Couldn't create your account", error.message);
      return null;
    }
  };

  const handleVerify = async (email, code) => {
    try {
      enterApp(await verifySignUpCode(email, code));
    } catch (error) {
      Alert.alert("Couldn't confirm your email", error.message);
    }
  };

  const handleResend = async (email) => {
    try {
      await resendSignUpCode(email);
    } catch (error) {
      Alert.alert("Couldn't send the code", error.message);
    }
  };

  const handleForgot = async (email) => {
    try {
      await sendPasswordResetCode(email);
      return true;
    } catch (error) {
      Alert.alert("Couldn't send the code", error.message);
      return false;
    }
  };

  const handleReset = async ({ email, code, password }) => {
    try {
      enterApp(await resetPassword(email, code, password));
    } catch (error) {
      Alert.alert("Couldn't change your password", error.message);
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
      // The class board already carries weekly, monthly and overall XP for everyone, and
      // the ranking screen orders it for the chosen period itself: nothing to ask.
      if (rankingScope === "class") return;
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

  // A course the student paid for belongs in "Your courses" without them adding it.
  useEffect(() => {
    if (!user || myCourseIds === null) return;
    const merged = withPurchased(myCourseIds, courses);
    if (merged !== myCourseIds) setMine(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, courses, myCourseIds]);

  // Access can end while a chapter is open. The server already refuses it, so this only moves the
  // student somewhere useful: the course's own page, with a way to renew. Answers stay on the phone.
  useEffect(() => {
    if (!selectedCourse || !isLocked(selectedCourse)) return;
    if (!["intro", "path", "stage", "activity"].includes(screen)) return;
    const at = stack.indexOf("course");
    setStack(at >= 0 ? stack.slice(0, at + 1) : [...stack.slice(0, -1), "course"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse, screen]);
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
      intro = !isLocked(course) && isFreshCourse(course) && !(await hasSeen(user.id, "intro", course.id));
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
    // A locked course opens on its own page, with the way to get access.
    if (isLocked(course)) {
      setSelectedCourse(course);
      showScreen([...stack, "course"]);
      return;
    }
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

  // "Submit again" from the list of requests. A course that has since gone isn't on sale. A Pro
  // request goes back to the plans, which may have changed.
  const buyAgain = (request) => {
    if (request.kind === "plan") {
      openPro();
      return;
    }
    const course = courses.find((candidate) => candidate.id === request.courseId);
    if (!course || course.purchasable === false) {
      Alert.alert("Not available", "This course isn't available to buy right now.");
      return;
    }
    setSelectedCourse(course);
    openScreen("purchase");
  };

  // The selected chapter as it is in the latest course data (so "done"
  // updates after a submit).
  const currentLesson =
    flattenChapters(selectedCourse).find((lesson) => lesson.id === selectedLesson?.id) ??
    selectedLesson;

  // Shown on a back link: the screen you'd return to.
  const BACK_LABELS = { home: "Home", courses: "Courses", explore: "Explore", profile: "Profile", payments: "Requests", pro: "EA Pro" };
  const previousScreen = stack[stack.length - 2];
  const backLabel =
    previousScreen === "course" ? selectedCourse?.title : BACK_LABELS[previousScreen];

  const myCourses = courses.filter((course) => isMine(course.id));

  const rankingEntries = Array.isArray(ranking?.entries) ? ranking.entries : [];

  // Starting up or loading the student's data: Home's own layout in soft grey shapes (Home is where
  // a logged-in student lands), never a spinner or a blank screen. With no saved login, the login
  // screen shows straight away.
  const homeSkeleton = (
    <View style={styles.loadingScreen}>
      <HomeSkeleton />
      <BottomNavBar active="home" onNavigate={() => {}} />
    </View>
  );

  if ((restoring && savedSession !== false && !user) || (!fontsLoaded && !fontError)) {
    return homeSkeleton;
  }

  if (!user) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        onGoogle={handleGoogle}
        onSignUp={handleSignUp}
        onVerify={handleVerify}
        onResend={handleResend}
        onForgot={handleForgot}
        onReset={handleReset}
      />
    );
  }

  // Accounts from before phone sign-up are asked once for username, phone and school.
  if (user.profileComplete === false) {
    return (
      <FinishProfileScreen
        user={user}
        onDone={(profile) =>
          setUser({ ...user, username: profile.username, phone: profile.phone, profileComplete: profile.profileComplete })
        }
        onLogout={handleLogout}
      />
    );
  }

  if (loadingData || !student) {
    return homeSkeleton;
  }

  if (screen === "home") {
    return (
      <HomeScreen
        userId={user.id}
        user={student}
        courses={myCourses}
        loading={myCourseIds === null}
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
        pro={pro}
        ranking={rankingEntries}
        onBack={goBack}
        onLogout={handleLogout}
        onRequests={() => openScreen("payments")}
        onPro={openPro}
        {...navProps}
      />
    );
  }

  if (screen === "courses") {
    return (
      <CoursesScreen
        courses={courses}
        myCourseIds={myCourseIds ?? []}
        loading={myCourseIds === null}
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

  if (screen === "purchase" && selectedCourse) {
    return (
      <PurchaseScreen
        course={selectedCourse}
        backLabel={backLabel}
        onBack={goBack}
        onSent={refreshProgress}
        onRequests={() => showScreen([...stack.slice(0, -1), "payments"])}
      />
    );
  }

  if (screen === "pro") {
    return (
      <ProScreen
        pro={pro}
        proCourseCount={courses.filter(isProCourse).length}
        backLabel={backLabel}
        onBack={goBack}
        onChoose={(plan) => {
          setSelectedPlan(plan);
          openScreen("purchasePlan");
        }}
        onRequests={() => openScreen("payments")}
      />
    );
  }

  if (screen === "purchasePlan" && selectedPlan) {
    return (
      <PurchaseScreen
        plan={selectedPlan}
        backLabel={backLabel}
        onBack={goBack}
        onSent={refreshProgress}
        onRequests={() => showScreen([...stack.slice(0, -1), "payments"])}
      />
    );
  }

  if (screen === "payments") {
    return <PaymentRequestsScreen backLabel={backLabel} onBack={goBack} onSubmitAgain={buyAgain} />;
  }

  if (screen === "course" && isLocked(selectedCourse)) {
    return (
      <LockedCourseScreen
        course={selectedCourse}
        pro={pro}
        backLabel={backLabel}
        onBack={goBack}
        onBuy={() => openScreen("purchase")}
        onPro={openPro}
        onRequests={() => openScreen("payments")}
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
        onRenew={() => openScreen("purchase")}
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
      backgroundColor: colors.screenBg,
    },
  });
