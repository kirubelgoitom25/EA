import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
import { layout, level, space, tokens } from "../../theme";
import AppText from "../ui/AppText";
import Button from "../ui/Button";
import Fox from "../ui/Fox";
import { useFoxReact } from "../ui/FoxContext";
import EmptyState from "../ui/EmptyState";
import { Pulse, QuestionSkeleton } from "../ui/Skeleton";
import FeedbackNote from "./FeedbackNote";
import QuestionView from "./QuestionView";
import ResultsView from "./ResultsView";
import StageResultView from "./StageResultView";
import {
  allAnswered,
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
export default function StageSession({
  userId,
  lesson,
  stageIndex: requestedStage,
  hasNextChapter,
  onExit,
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
  const [draft, setDraft] = useState("");
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

  const choose = (optionIndex) => {
    if (answered) return;
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

  const goNext = () => {
    if (isLast) {
      finishStage();
      return;
    }
    setIndex((current) => current + 1);
    setAnswered(false);
    setDraft("");
  };

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
        onBackToCourse={onExit}
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
        statuses={statuses}
        review={wrongChoices(stageQuestions, answers)}
        nextStageNumber={next ? next.index + 1 : null}
        onNextStage={() => next && onOpenStage(next.index)}
        onRetry={() => setRunId((n) => n + 1)}
        onBackToChapter={onExit}
      />
    );
  }

  // Loading: the question's own layout in soft grey shapes, where the real one will appear.
  if (phase === "loading") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
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
      <TopBar onExit={onExit} total={stageQuestions.length} current={index} answered={answered} />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <QuestionView
          key={question.key}
          question={question}
          stageNumber={stageIndex + 1}
          answer={isFill && !answered ? draft : answer}
          answered={answered}
          onChoose={choose}
          onType={setDraft}
          onSubmitText={checkText}
        />

        {answered ? (
          <FeedbackNote
            key={`${question.key}-note`}
            verdict={verdict}
            note={feedbackNote}
            explanation={question.explanation}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>
        {answered ? (
          <Button label={isLast ? "Finish stage" : "Continue"} onPress={goNext} />
        ) : isFill ? (
          <Button label="Check" onPress={checkText} disabled={!draft.trim()} />
        ) : (
          <AppText variant="label" tone="secondary" style={styles.hint}>
            Tap an answer
          </AppText>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ✕ to leave, then one segment per question of the stage. Answered
// segments are filled along the Tail; the current one is tinted.
function TopBar({ onExit, total, current, answered }) {
  const segments = total ? Array.from({ length: total }, (_, i) => i) : [];
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
        <View
          style={styles.segments}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Question ${current + 1} of ${total}`}
        >
          {segments.map((i) => (
            <View
              key={i}
              style={[
                styles.segment,
                {
                  backgroundColor:
                    i < done
                      ? level.segmentDone
                      : i === current
                        ? level.segmentNow
                        : level.segmentAhead,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
      {/* the small companion: she reacts to each answer and keeps quiet otherwise */}
      {total ? <Fox pose="head" size={42} reactive tappable caption bubble="below" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: level.lessonBg,
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

  segments: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
  },

  segment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },

  hint: {
    textAlign: "center",
    paddingVertical: space.lg,
  },

  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
  },

  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space.md,
    backgroundColor: level.lessonBg,
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
