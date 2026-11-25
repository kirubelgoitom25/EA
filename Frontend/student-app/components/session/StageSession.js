import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  clearProgress,
  loadChapterQuestions,
  loadProgress,
  saveProgress,
  submissionIdFor,
  submitChapter,
} from "../../services/chapterProgress";
import { feedback, haptic } from "../../services/feedback";
import { layout, level, space, tokens, ui } from "../../theme";
import AppText from "../ui/AppText";
import Button from "../ui/Button";
import Fox from "../ui/Fox";
import { useFoxReact } from "../ui/FoxContext";
import EmptyState from "../ui/EmptyState";
import { CURVE, MOTION, useReducedMotion } from "../ui/motion";
import ProgressBar from "../ui/ProgressBar";
import { LightScenery } from "../ui/Scenery";
import { Pulse, QuestionSkeleton } from "../ui/Skeleton";
import FeedbackNote, { VERDICTS } from "./FeedbackNote";
import QuestionView from "./QuestionView";
import ResultsView from "./ResultsView";
import StageResultView from "./StageResultView";
import {
  allAnswered,
  bestStreak,
  evaluate,
  isStageDone,
  nextStageIndex,
  splitStages,
  stageStatuses,
  stageSummary,
  validAnswers,
  wrongChoices,
} from "./sessionModel";

// One stage (up to 10 questions) of a chapter, with instant feedback.
// When it ends, its answers are saved on the phone. If every question of
// the chapter now has an answer, the whole chapter is submitted (once)
// and the server's results are shown; otherwise the stage result is.
//
// stageIndex null = "continue": the first stage not done yet.
// phase: loading | error | empty | question | submitting | submitError | stageResult | final
//
// The session slides up from the bottom when it opens (420 ms) and back down when it is closed with ✕
// (300 ms, ease-in); leaving from a result fades it instead (280 ms). Leaving starts the move on the
// native driver and switches screens on the next frame, so the next screen builds while this one is
// still moving and there is never a blank frame. Reduce Motion: a 150 ms fade.
export default function StageSession(props) {
  const reduce = useReducedMotion();
  const { height } = useWindowDimensions();
  const place = useRef(new Animated.Value(0)).current; // 0 below the screen (or invisible), 1 in place
  const fade = useRef(new Animated.Value(1)).current;
  const left = useRef(false);

  useEffect(() => {
    const run = Animated.timing(place, {
      toValue: 1,
      duration: reduce ? MOTION.fade : 420,
      easing: CURVE.screen,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = (how, then) => {
    if (left.current) return;
    left.current = true;
    if (how === "down" && !reduce) {
      Animated.timing(place, { toValue: 0.4, duration: 300, easing: CURVE.exit, useNativeDriver: true }).start();
    } else {
      Animated.timing(fade, { toValue: 0.3, duration: reduce ? MOTION.fade : 280, easing: CURVE.exit, useNativeDriver: true }).start();
    }
    requestAnimationFrame(() => then?.());
  };
  // a result's buttons open another stage or chapter: those may run again later in this session
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);
  const fadeThen = (fn) => (...args) => {
    leave("fade", () => {
      left.current = false;
      fn?.(...args);
      // still here (the same stage was asked for again): come back into view
      setTimeout(() => {
        if (alive.current) Animated.timing(fade, { toValue: 1, duration: MOTION.fade, useNativeDriver: true }).start();
      }, 320);
    });
  };

  const look = useMemo(
    () => ({
      flex: 1,
      opacity: reduce ? Animated.multiply(place, fade) : fade,
      transform: [{ translateY: reduce ? 0 : place.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
    }),
    [place, fade, reduce, height],
  );

  return (
    <View style={styles.under}>
      <Animated.View style={look}>
        <StageBody
          {...props}
          onExit={() => leave("down", props.onExit)}
          onExitFade={() => leave("fade", props.onExit)}
          onOpenStage={fadeThen(props.onOpenStage)}
          onNextChapter={fadeThen(props.onNextChapter)}
        />
      </Animated.View>
    </View>
  );
}

function StageBody({
  userId,
  lesson,
  stageIndex: requestedStage,
  hasNextChapter,
  onExit,
  onExitFade,
  onOpenStage,
  onNextChapter,
  onComplete,
}) {
  const insets = useSafeAreaInsets();
  const foxReact = useFoxReact();
  const [runId, setRunId] = useState(0); // bumped by "Try again"
  const [phase, setPhase] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [savedAnswers, setSavedAnswers] = useState({}); // other stages
  const [stageIndex, setStageIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // this stage
  const [answered, setAnswered] = useState(false);
  const [selected, setSelected] = useState(undefined); // the picked option, before Check
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState(false); // a word is held: the page doesn't scroll meanwhile
  const [submitState, setSubmitState] = useState({ results: {}, total: null });
  const mounted = useRef(true);
  const scrollRef = useRef(null);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setIndex(0);
    setAnswers({});
    setAnswered(false);
    setSelected(undefined);
    setDraft("");

    Promise.all([loadChapterQuestions(lesson.id), loadProgress(userId, lesson.id)])
      .then(([list, progress]) => {
        if (cancelled) return;
        const saved = validAnswers(list, progress.answers);
        const stages = splitStages(list);
        setQuestions(list);
        setSavedAnswers(saved);
        setStageIndex(
          requestedStage === null || requestedStage === undefined || requestedStage >= stages.length
            ? nextStageIndex(stages, saved)
            : requestedStage,
        );
        setPhase(list.length ? "question" : "empty");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error.message);
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [lesson.id, userId, requestedStage, runId]);

  const stages = useMemo(() => splitStages(questions), [questions]);
  const stage = stages[stageIndex];
  const stageQuestions = stage?.questions ?? [];
  const question = stageQuestions[index];
  const isLast = index === stageQuestions.length - 1;
  const answer = question ? answers[question.key] : undefined;
  const verdict = question && answered ? evaluate(question, answer) : null;
  const merged = useMemo(() => ({ ...savedAnswers, ...answers }), [savedAnswers, answers]);

  // Bring the feedback note into view once the student answers.
  useEffect(() => {
    if (!answered) return undefined;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [answered]);

  // One submit at a time: a double tap must not send the chapter twice.
  const submitting = useRef(false);
  const submit = useCallback(
    async (allAnswers, done) => {
      if (submitting.current) return;
      submitting.current = true;
      setPhase("submitting");
      const submissionId = await submissionIdFor(userId, lesson.id);
      const { results, failed, total } = await submitChapter(lesson.id, questions, allAnswers, done, submissionId);
      submitting.current = false;
      if (!mounted.current) return;
      setSubmitState({ results, total });
      if (failed.length) {
        setPhase("submitError");
        return;
      }
      await clearProgress(userId, lesson.id);
      feedback.complete({ xp: total.xp });
      foxReact("chapterDone");
      setPhase("final");
      onComplete?.();
    },
    [lesson.id, questions, userId, onComplete, foxReact],
  );

  // End of the stage: save, then submit the chapter or show the stage result.
  const finishStage = async () => {
    const all = merged;
    const stagesDone = stages.filter((s) => isStageDone(s, all)).length;
    await saveProgress(userId, lesson.id, { answers: all, stageCount: stages.length, stagesDone });
    if (!mounted.current) return;
    setSavedAnswers(all);

    if (allAnswered(questions, all)) {
      submit(all, {});
    } else {
      foxReact("stageDone");
      setPhase("stageResult");
    }
  };

  // A tap picks an answer (it can be changed); Check commits it and shows the verdict.
  const select = (optionIndex) => {
    if (answered) return;
    setSelected(optionIndex);
  };

  const check = () => {
    if (answered || selected === undefined || selected === null) return;
    const optionIndex = selected;
    setAnswers((current) => ({ ...current, [question.key]: optionIndex }));
    setAnswered(true);
    const result = evaluate(question, optionIndex);
    if (result === "correct") {
      feedback.correct();
      foxReact("correct");
    } else if (result === "wrong") {
      feedback.wrong();
      foxReact("wrong");
    }
    else haptic.light();
  };

  const checkText = () => {
    const text = draft.trim();
    if (!text || answered) return;
    setAnswers((current) => ({ ...current, [question.key]: text }));
    setAnswered(true);
    haptic.light();
  };

  // Question to question: the content slides 70 dp left and fades (220 ms), the next one comes in from
  // 70 dp right (380 ms) and its pieces rise in turn. The bar, the header and the button stay put.
  const reduce = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const moving = useRef(false);
  const goNext = () => {
    if (moving.current) return;
    if (isLast) {
      finishStage();
      return;
    }
    const advance = () => {
      setIndex((current) => current + 1);
      setAnswered(false);
      setSelected(undefined);
      setDraft("");
    };
    moving.current = true;
    const out = reduce
      ? Animated.timing(slide, { toValue: -1, duration: MOTION.fade, useNativeDriver: true })
      : Animated.timing(slide, { toValue: -1, duration: 220, easing: CURVE.exit, useNativeDriver: true });
    out.start(() => {
      slide.setValue(1);
      advance();
      const back = reduce
        ? Animated.timing(slide, { toValue: 0, duration: MOTION.fade, useNativeDriver: true })
        : Animated.timing(slide, { toValue: 0, duration: 380, easing: CURVE.screen, useNativeDriver: true });
      back.start(() => {
        moving.current = false;
      });
    });
  };
  const slideLook = useMemo(
    () => ({
      opacity: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [{ translateX: reduce ? 0 : slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [-70, 0, 70] }) }],
    }),
    [slide, reduce],
  );

  // Fill-in (and any question without an answer key) is only saved here.
  const feedbackNote =
    verdict === "saved" ? "Scored by the server when you finish the chapter." : null;

  // ---------- Results ----------

  if (phase === "final") {
    return (
      <ResultsView
        chapterTitle={lesson.title}
        result={submitState.total}
        review={wrongChoices(questions, merged)}
        stageCount={stages.length}
        hasNext={hasNextChapter}
        onNext={onNextChapter}
        onRetry={() => onOpenStage(0)}
        onBackToCourse={onExitFade}
        backLabel="Back to chapter"
      />
    );
  }

  if (phase === "stageResult") {
    const statuses = stageStatuses(stages, merged, false);
    const next = stages.find((s) => !isStageDone(s, merged));
    return (
      <StageResultView
        stageNumber={stageIndex + 1}
        summary={stageSummary(stage, merged)}
        streak={bestStreak(stageQuestions, merged)}
        statuses={statuses}
        review={wrongChoices(stageQuestions, answers)}
        nextStageNumber={next ? next.index + 1 : null}
        onNextStage={() => next && onOpenStage(next.index)}
        onRetry={() => setRunId((n) => n + 1)}
        onBackToChapter={onExitFade}
      />
    );
  }

  // Loading: the question's own layout in soft grey shapes, where the real one will appear.
  if (phase === "loading") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Ground />
        <TopBar onExit={onExit} />
        <View style={styles.content}>
          <QuestionSkeleton />
        </View>
      </View>
    );
  }

  if (phase !== "question") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Ground />
        <TopBar onExit={onExit} />
        <View style={styles.centerFill}>
          {phase === "submitting" ? (
            <Pulse style={styles.loading} label="Saving your chapter">
              <AppText tone="secondary">Saving your chapter…</AppText>
            </Pulse>
          ) : null}

          {phase === "empty" ? (
            <EmptyState
              title="Questions are on their way"
              message="This chapter doesn't have questions yet."
              actionLabel="Back"
              onAction={onExit}
            />
          ) : null}

          {phase === "error" ? (
            <EmptyState
              title="Couldn't load this chapter"
              message={loadError}
              actionLabel="Try again"
              onAction={() => setRunId((n) => n + 1)}
            />
          ) : null}

          {phase === "submitError" ? (
            <EmptyState
              title="We couldn't save your chapter"
              message="Check your connection. Your answers are kept on this phone — nothing is lost."
              actionLabel="Retry"
              onAction={() => submit(merged, submitState.results)}
            />
          ) : null}
        </View>
      </View>
    );
  }

  // ---------- Question ----------

  const isFill = question.kind === "fill";

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Ground />
      <TopBar onExit={onExit} total={stageQuestions.length} current={index} answered={answered} />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
      >
        <Animated.View style={slideLook}>
          <QuestionView
            key={question.key}
            question={question}
            stageNumber={stageIndex + 1}
            selected={selected}
            answer={isFill && !answered ? draft : answer}
            answered={answered}
            onSelect={select}
            onType={setDraft}
            onSubmitText={checkText}
            onDragging={setDragging}
          />
        </Animated.View>
      </ScrollView>

      <Footer verdict={answered ? verdict : null} bottom={space.lg + insets.bottom}>
        {answered ? (
          <FeedbackNote
            key={`${question.key}-note`}
            verdict={verdict}
            note={feedbackNote}
            explanation={question.explanation}
          />
        ) : null}
        {answered ? (
          <Button label={isLast ? "Finish stage" : "Continue"} tone={verdict === "wrong" ? "wrong" : undefined} onPress={goNext} />
        ) : isFill ? (
          <Button label="Check" onPress={checkText} disabled={!draft.trim()} />
        ) : (
          <Button label="Check" onPress={check} disabled={selected === undefined || selected === null} />
        )}
      </Footer>
    </KeyboardAvoidingView>
  );
}

// ✕ to leave, then the stage's progress: one 18 dp bar that fills a step each time a question is
// checked (with the fill motion's little overshoot).
function TopBar({ onExit, total, current, answered }) {
  const done = current + (answered ? 1 : 0);

  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onExit}
        hitSlop={space.md}
        accessibilityRole="button"
        accessibilityLabel="Leave stage"
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Ionicons name="close" size={26} color={tokens.textSecondary} />
      </Pressable>
      {total ? (
        <ProgressBar
          value={done / total}
          height={18}
          radius={10}
          track={ui.track}
          inset={{ color: ui.trackInset, height: 2 }}
          fill={ui.fill}
          stripe={{ color: ui.fillTop, height: 5 }}
          change={{ duration: MOTION.fill }}
          curve={CURVE.fill}
          style={styles.flex}
          accessibilityLabel={`Question ${current + 1} of ${total}`}
        />
      ) : null}
      {/* the small companion: she reacts to each answer and keeps quiet otherwise */}
      {total ? <Fox pose="head" size={42} reactive tappable caption bubble="below" /> : null}
    </View>
  );
}

// The soft green-blue lesson ground, behind everything else on the screen, with low hills and a pine
// along the bottom.
function Ground() {
  const { width } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={level.lessonGradient} style={StyleSheet.absoluteFill} />
      <LightScenery width={width} />
    </View>
  );
}

// The button area. Once a question is checked it fades (250 ms) to the feedback sheet's colour, with
// rounded top corners and a 2 dp border, so the sheet rising into it and the button read as one panel.
function Footer({ verdict, bottom, children }) {
  const tint = useRef(new Animated.Value(verdict ? 1 : 0)).current;
  const shown = useRef(verdict);
  if (verdict) shown.current = verdict;
  const look = (VERDICTS[shown.current] ?? VERDICTS.saved).sheet;
  useEffect(() => {
    const run = Animated.timing(tint, { toValue: verdict ? 1 : 0, duration: verdict ? 250 : 120, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [verdict, tint]);
  return (
    <Animated.View
      style={[
        styles.footer,
        {
          paddingBottom: bottom,
          paddingTop: verdict ? 18 : space.md,
          backgroundColor: tint.interpolate({ inputRange: [0, 1], outputRange: ["rgba(255,255,255,0)", look.bg] }),
          borderColor: tint.interpolate({ inputRange: [0, 1], outputRange: ["rgba(255,255,255,0)", look.border] }),
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}


const styles = StyleSheet.create({
  // under the sliding session: the path's sky, so a moving session never shows a blank screen
  under: {
    flex: 1,
    backgroundColor: ui.sky,
  },

  screen: {
    flex: 1,
  },

  flex: {
    flex: 1,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.gutter,
    paddingVertical: space.md,
  },


  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
  },

  footer: {
    paddingHorizontal: layout.gutter,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 2,
    borderBottomWidth: 0,
    marginHorizontal: -2, // the side borders sit just off screen; only the top edge and corners show
  },

  centerFill: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: layout.gutter,
  },

  loading: {
    alignItems: "center",
  },


  pressed: {
    opacity: 0.6,
  },
});
