import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, Easing, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  clearProgress,
  loadChapterQuestions,
  loadProgress,
  submissionIdFor,
  submitChapter,
} from "../services/chapterProgress";
import { fetchLessonActivities } from "../services/api";
import { buildSteps, hasOwnSteps, nextStepAfter } from "../services/activitySteps";
import { feedback } from "../services/feedback";
import { edge, fonts, layout, space, tokens, ui } from "../theme";
import { validAnswers } from "./session/sessionModel";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import { useFoxReact } from "./ui/FoxContext";
import ProgressBar from "./ui/ProgressBar";
import { ADVANCE, SCREEN } from "./ui/pathMotionModel";
import { handOff, takeHandoff } from "./ui/handoff";
import { CURVE, useReducedMotion } from "./ui/motion";
import PressLip, { EdgeBox } from "./ui/PressLip";
import StatChips from "./ui/StatChips";
import { win } from "./ui/StepMorph";
import DotGrid from "./ui/DotGrid";
import Route from "./ui/Route";
import { chapterPath } from "./chapterPathModel";
import { PathSkeleton } from "./ui/Skeleton";
import StatusBarScrim, { scrimOnScroll } from "./ui/StatusBarScrim";

// A chapter as ONE path, in the order the teacher set: its videos and readings, and its question
// stages (10 questions each), ending at the den. Every step is open; the path shows what's done,
// where the fox is (the next step, which opens into a card with the one thing to do) and what's still
// to come. The chapter's score and XP are saved once every question stage is done.
// The header panel's height below the status bar: back button, "CHAPTER 3", a two-line title and
// the progress bar (the level-2 reference: 206 on a 390 x 844 screen).
// From the safe area's top to where the path (and its scenery) starts: the fixed top bar (72), 4 dp,
// the header card (104 + its 6 dp edge), less the 14 dp of scenery the card overlaps. Fixed, so the
// course page's travelling tile knows where the current lesson will be.
const TOP_BAR = 14 + 48 + 10;
const CARD = 104;
export const PANEL_HEIGHT = TOP_BAR + 4 + CARD + edge.banner.depth - 14;

// the bar fills in step with the path's advance
const BAR_CHANGE = { delay: ADVANCE.lead + ADVANCE.bar[0], duration: ADVANCE.bar[1] - ADVANCE.bar[0] };

// Each chapter as it was last loaded in this session (per student), so coming back to it shows it at
// once while the fresh copy loads quietly behind. Emptied on logout.
const lastLoaded = new Map();
const cacheKey = (userId, lessonId) => `${userId}:${lessonId}`;
export function forgetChapterCache() {
  lastLoaded.clear();
}

// Loads a chapter (its questions, the answers saved on this phone, its videos and readings) and keeps
// it as the chapter's last loaded copy.
function loadChapter(userId, lessonId) {
  return Promise.all([
    loadChapterQuestions(lessonId),
    loadProgress(userId, lessonId),
    // Videos and readings from Course Studio. If they can't be loaded the chapter still works as
    // it always did, so a failure here is not an error for the student.
    fetchLessonActivities(lessonId).catch(() => null),
  ]).then(([questions, progress, lessonActivities]) => {
    const steps = buildSteps(lessonActivities?.activities);
    const next = {
      phase: questions.length || hasOwnSteps(steps) ? "ready" : "empty",
      questions,
      steps,
      answers: validAnswers(questions, progress.answers),
    };
    lastLoaded.set(cacheKey(userId, lessonId), next);
    return next;
  });
}

// The course page loads the chapter you are on ahead of time, so it opens at once and the
// chapter-to-lessons move knows where its current lesson will be. Failures are silent.
export function prefetchChapter(userId, lessonId) {
  if (lastLoaded.has(cacheKey(userId, lessonId))) return;
  loadChapter(userId, lessonId).catch(() => {});
}

// The chapter as last loaded in this session, or null.
export const cachedChapter = (userId, lessonId) => lastLoaded.get(cacheKey(userId, lessonId)) ?? null;

export default function ChapterPathScreen({
  userId,
  student,
  ranking,
  onRanking,
  course,
  chapterNumber,
  chapterCount,
  lesson,
  onBack,
  onOpenStage,
  onOpenActivity,
  onComplete,
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  // Arriving from the course page's travelling tile (SCREEN.enter): that tile is already in place as
  // the current lesson; the panel and title come in, then the rest of the path and, last, the fox.
  const [entry, setEntry] = useState(() => {
    if (reduce) return null;
    const handed = takeHandoff("lessons", lesson.id);
    return handed ? { clock: new Animated.Value(0), target: handed.target } : null;
  });
  useEffect(() => {
    if (!entry) return undefined;
    let run = null;
    const frame = requestAnimationFrame(() => {
      run = Animated.timing(entry.clock, { toValue: SCREEN.enter.end, duration: SCREEN.enter.end, easing: Easing.linear, useNativeDriver: true });
      run.start(({ finished }) => finished && setEntry(null));
    });
    return () => {
      cancelAnimationFrame(frame);
      run?.stop();
    };
  }, [entry]);

  // built once per entry: a style built again mid-move would read the clock's stale JS value
  const entryLooks = useMemo(
    () =>
      entry
        ? {
            panel: { opacity: win(entry.clock, SCREEN.enter.panel, 0, 1) },
            title: { opacity: win(entry.clock, SCREEN.enter.title, 0, 1), transform: [{ translateY: win(entry.clock, SCREEN.enter.title, SCREEN.enter.titlePx, 0) }] },
          }
        : null,
    [entry],
  );

  // Back to the course page (the back button, or Android's): this page fades back a little smaller and
  // the course page then fades in (SCREEN.back). The switch starts at once, alongside the fade (which
  // runs on the native driver), and the page never fades out completely, so however long the course
  // page takes to build there is never a blank screen.
  const fade = useRef(new Animated.Value(1)).current;
  const [goingBack, setGoingBack] = useState(false);
  const wentBack = useRef(false);
  const finishBack = () => {
    if (wentBack.current) return;
    wentBack.current = true;
    if (course) handOff("backToCourse", course.id);
    onBack();
  };
  const goBack = () => {
    if (reduce) return onBack();
    if (goingBack) return undefined;
    setGoingBack(true);
    Animated.timing(fade, { toValue: 0, duration: SCREEN.back.out, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    // one frame later, so the fade is already running natively while the course page builds
    requestAnimationFrame(finishBack);
    return undefined;
  };
  const backLook = useMemo(
    () => ({
      opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [SCREEN.back.outOpacity, 1] }),
      transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [SCREEN.back.outScale, 1] }) }],
    }),
    [fade],
  );
  const goBackNow = useRef(goBack);
  goBackNow.current = goBack;
  useEffect(() => {
    // added after the app's own handler, so Android's back reaches this one first
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBackNow.current();
      return true;
    });
    return () => subscription.remove();
  }, []);
  const foxReact = useFoxReact();
  const [scrolled, setScrolled] = useState(false);
  const [state, setState] = useState(() => lastLoaded.get(cacheKey(userId, lesson.id)) ?? { phase: "loading" });
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedXp, setSavedXp] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const key = cacheKey(userId, lesson.id);
    // with a copy on screen already, refresh behind it; otherwise show the loading shapes
    if (!lastLoaded.has(key)) setState({ phase: "loading" });
    loadChapter(userId, lesson.id)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((error) => {
        // a failed quiet refresh keeps the copy on screen
        if (!cancelled && !lastLoaded.has(key)) setState({ phase: "error", message: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [lesson.id, userId, reload]);

  // Every stage answered but the chapter wasn't saved (no connection at the
  // time, or the app was closed): save it from here.
  const savingNow = useRef(false); // a double tap must not send the chapter twice
  const saveChapter = async () => {
    if (savingNow.current) return;
    savingNow.current = true;
    setSaving(true);
    const submissionId = await submissionIdFor(userId, lesson.id);
    const { failed, total } = await submitChapter(lesson.id, state.questions, state.answers, {}, submissionId);
    savingNow.current = false;
    setSaving(false);
    if (failed.length) return;
    await clearProgress(userId, lesson.id);
    feedback.complete({ xp: total.xp });
    foxReact("chapterDone");
    setSavedXp(total.xp);
    onComplete?.();
    setReload((n) => n + 1);
  };

  const { loaded, ready, steps, pendingSave, questionsDone, items, nextAt, doneCount, routeItems, den } = chapterPath(state, lesson);

  // The path says how far along you are; words are only for the reward.
  const saved = savedXp !== null ? `Chapter saved${savedXp > 0 ? ` · +${savedXp} XP` : ""}` : "";

  // What a video or reading needs to show where it is and what follows it. follow(activity) gives
  // the same for the step after it, so a student can go on without coming back to this trail.
  const trailFor = (step) => {
    const at = items.findIndex((item) => item.step === step);
    return {
      context: {
        courseTitle: course?.title,
        chapterNumber,
        chapterTitle: lesson.title,
        step: at + 1,
        steps: items.length,
      },
      next: nextStepAfter(steps, step.activity.id, { questionsDone }),
      follow: (activity) => {
        const following = steps.find((candidate) => candidate.activity?.id === activity.id);
        return following ? trailFor(following) : { context: null, next: null };
      },
    };
  };
  const openStep = (step) => onOpenActivity?.(step.activity, trailFor(step));
  const openItem = (item) => (item.kind === "stage" ? onOpenStage(item.stageIndex) : openStep(item.step));

  // The next step's bubble on the path starts it; the pinned button is only for what the
  // path can't say: saving a finished set of answers, or practicing a finished chapter again.
  const nextItem = nextAt >= 0 ? items[nextAt] : null;
  let footerButton = null;
  if (pendingSave) {
    footerButton = <Button label="Save chapter results" onPress={saveChapter} loading={saving} />;
  } else if (!nextItem && ready) {
    footerButton = <Button label="Practice again" onPress={() => onOpenStage(null)} />;
  }

  return (
    <Animated.View style={[styles.root, backLook]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: footerButton ? 120 + insets.bottom : space.xxxl }}
        showsVerticalScrollIndicator={false}
        onScroll={scrimOnScroll(24, scrolled, setScrolled)}
        scrollEventThrottle={32}
      >
        <DotGrid />

        {/* the header card, always the same height, so the path below starts at the same place whatever
            the title's length (the course page's travelling tile relies on it); it overlaps the top 14 dp
            of the scenery */}
        <View style={[styles.panel, { height: insets.top + PANEL_HEIGHT + 14 }]}>
          <Animated.View style={entryLooks?.panel}>
            <EdgeBox lip={ui.surfaceEdge} lipSize={edge.banner.depth} radius={edge.banner.radius} border faceStyle={styles.card}>
              <EdgeBox lip="#A82566" lipSize={4} radius={15} highlight="#EE78AE" faceStyle={styles.bookTile}>
                <Ionicons name="book" size={24} color="#FFFFFF" />
              </EdgeBox>
              <Animated.View style={[styles.cardWords, entryLooks?.title]}>
                <AppText style={styles.kicker} numberOfLines={1}>
                  {saved
                    ? saved.toUpperCase()
                    : [
                        chapterNumber ? `CHAPTER ${chapterNumber}` : "CHAPTER",
                        loaded && items.length ? (nextAt >= 0 ? `LESSON ${nextAt + 1} OF ${items.length}` : `${items.length} OF ${items.length} DONE`) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </AppText>
                <AppText numberOfLines={2} style={styles.title}>
                  {lesson.title}
                </AppText>
                <ProgressBar
                  value={loaded && items.length ? doneCount / items.length : 0}
                  height={10}
                  radius={6}
                  fill={ui.fill}
                  track={ui.track}
                  stripe={{ color: ui.fillTop, height: 3 }}
                  curve={CURVE.fill}
                  change={BAR_CHANGE}
                  intro={entry ? SCREEN.enter.bar : undefined}
                  style={styles.statusBar}
                  accessibilityLabel={loaded && items.length ? `${doneCount} of ${items.length} ${items.length === 1 ? "lesson" : "lessons"} done` : "Loading progress"}
                />
              </Animated.View>
            </EdgeBox>
          </Animated.View>
        </View>

        {state.phase === "loading" ? <PathSkeleton count={4} style={styles.loading} /> : null}
        {state.phase === "empty" || state.phase === "error" ? (
          <View style={styles.message}>
            {state.phase === "empty" ? (
              <EmptyState title="Questions are on their way" message="This chapter doesn't have questions yet." />
            ) : (
              <EmptyState
                title="Couldn't load this chapter"
                message={state.message}
                actionLabel="Try again"
                onAction={() => setReload((n) => n + 1)}
              />
            )}
          </View>
        ) : null}

        {loaded && items.length ? (
          <Route
            style={styles.route}
            scenery
            trail="chapter"
            foxKey={`chapter-${lesson.id}`}
            onPress={(i) => openItem(items[i])}
            items={routeItems}
            den={{ course, eyebrow: "CHAPTER END", ...den }}
            entry={entry}
          />
        ) : null}
      </ScrollView>

      <StatusBarScrim visible={scrolled} color={ui.screen} />

      {/* the top bar, fixed: back to the course, and the stat chips */}
      <View style={[styles.topBar, { top: insets.top, backgroundColor: scrolled ? ui.screen : "transparent" }]} pointerEvents="box-none">
        <PressLip
          onPress={goBack}
          hitSlop={space.sm}
          accessibilityLabel={`Back to ${course?.title ?? "course"}`}
          lip={ui.surfaceEdge}
          lipSize={edge.topButton.depth}
          radius={edge.topButton.radius}
          border
          haptics
          faceStyle={styles.backFace}
        >
          <Ionicons name="chevron-back" size={22} color={tokens.text} />
        </PressLip>
        {student ? <StatChips user={student} ranking={ranking} onRanking={onRanking} /> : null}
      </View>

      {footerButton ? (
        <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>{footerButton}</View>
      ) : null}

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.screen,
  },

  // The card sits at the panel's bottom; the route starts 14 dp above its bottom edge.
  panel: {
    paddingHorizontal: 16,
    justifyContent: "flex-end",
    zIndex: 2,
    elevation: 2,
  },

  // the white header card: the pink book tile, then the words and the bar
  card: {
    height: CARD,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: ui.surface,
  },

  bookTile: {
    width: 50,
    height: 50,
    backgroundColor: "#E0408A",
    alignItems: "center",
    justifyContent: "center",
  },

  cardWords: {
    flex: 1,
  },

  kicker: {
    fontFamily: fonts.display,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    color: ui.primary,
  },

  title: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: 20,
    color: tokens.text,
    marginTop: 2,
  },

  statusBar: {
    marginTop: 8,
  },

  loading: {
    marginTop: 36, // where the first tile of the path will be
  },

  message: {
    paddingHorizontal: layout.gutter,
  },

  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: TOP_BAR,
    paddingTop: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  backFace: {
    width: 44,
    height: 44,
    backgroundColor: ui.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  pressed: {
    opacity: 0.7,
  },

  route: {
    marginTop: -14,
    marginHorizontal: layout.gutter,
    zIndex: 1,
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
  },
});
