import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { layout, space, stone, tokens } from "../theme";
import {
  allAnswered,
  splitStages,
  stageStatuses,
  validAnswers,
} from "./session/sessionModel";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import { useFoxReact } from "./ui/FoxContext";
import ProgressBar from "./ui/ProgressBar";
import DotGrid from "./ui/DotGrid";
import Emblem from "./ui/Emblem";
import Route from "./ui/Route";
import StatusBarScrim, { scrimOnScroll } from "./ui/StatusBarScrim";

// A chapter as ONE path, in the order the teacher set: its videos and readings, and its question
// stages (10 questions each), ending at the den. Every step is open; the path shows what's done,
// where the fox is (the next step, which opens into a card with the one thing to do) and what's still
// to come. The chapter's score and XP are saved once every question stage is done.
export default function ChapterPathScreen({
  userId,
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
  const foxReact = useFoxReact();
  const [scrolled, setScrolled] = useState(false);
  const [state, setState] = useState({ phase: "loading" });
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedXp, setSavedXp] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    Promise.all([
      loadChapterQuestions(lesson.id),
      loadProgress(userId, lesson.id),
      // Videos and readings from Course Studio. If they can't be loaded the chapter still works as
      // it always did, so a failure here is not an error for the student.
      fetchLessonActivities(lesson.id).catch(() => null),
    ])
      .then(([questions, progress, lessonActivities]) => {
        if (cancelled) return;
        const steps = buildSteps(lessonActivities?.activities);
        setState({
          phase: questions.length || hasOwnSteps(steps) ? "ready" : "empty",
          questions,
          steps,
          answers: validAnswers(questions, progress.answers),
        });
      })
      .catch((error) => {
        if (!cancelled) setState({ phase: "error", message: error.message });
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

  const loaded = state.phase === "ready";
  // "ready" below means there are question stages to show; a lesson that only has a video or a
  // reading is loaded but has none.
  const ready = loaded && state.questions.length > 0;
  const steps = loaded ? state.steps : [];
  const stages = ready ? splitStages(state.questions) : [];
  const anyStarted = ready && Object.keys(state.answers).length > 0;
  // A finished chapter shows every stage done — until it's practiced again;
  // then the trail shows that new run.
  // The server completes a chapter when its video or reading is marked complete, even if its
  // questions were never answered. Questions are optional, so then they stay open on the trail
  // while the chapter itself still counts as complete.
  const questionStep = steps.find((step) => step.type === "questions");
  const questionsAnswered = !questionStep || questionStep.activities.every((activity) => activity.completed);
  const chapterDone = !!lesson.completed && !anyStarted;
  const showComplete = chapterDone && questionsAnswered;
  const statuses = ready ? stageStatuses(stages, state.answers, showComplete) : [];
  const pendingSave = ready && allAnswered(state.questions, state.answers);
  const questionsDone = !ready || statuses.every((status) => status === "done");

  // The chapter's trail: every step in order. Question stages sit where the teacher put the quiz
  // or practice; a chapter whose activities couldn't be loaded keeps its stages on their own.
  const items = [];
  const addStages = () =>
    stages.forEach((stage, i) => items.push({ kind: "stage", stageIndex: i, status: statuses[i] === "done" ? "done" : "todo", size: stage.questions.length }));
  steps.forEach((step) => {
    if (step.type === "questions") addStages();
    else items.push({ kind: step.type, step, status: step.activity.completed ? "done" : "todo" });
  });
  if (ready && !steps.some((step) => step.type === "questions")) addStages();
  // The fox waits at the first step not done (not once the whole chapter is already finished).
  const nextAt = showComplete ? -1 : items.findIndex((item) => item.status !== "done");
  if (nextAt >= 0) items[nextAt].status = "next";
  const doneCount = items.filter((item) => item.status === "done").length;
  const allDone = items.length > 0 && doneCount === items.length;

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
  const actionFor = (item) =>
    item.kind === "video"
      ? "Watch video"
      : item.kind === "reading"
        ? "Read"
        : anyStarted ? "Continue" : "Start";
  let footerButton = null;
  if (pendingSave) {
    footerButton = <Button label="Save chapter results" onPress={saveChapter} loading={saving} />;
  } else if (!nextItem && ready) {
    footerButton = <Button label="Practice again" onPress={() => onOpenStage(null)} />;
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: footerButton ? 120 + insets.bottom : space.xxxl }}
        showsVerticalScrollIndicator={false}
        onScroll={scrimOnScroll(24, scrolled, setScrolled)}
        scrollEventThrottle={32}
      >
        <DotGrid />

        <View style={[styles.header, { paddingTop: insets.top + 60 }]}>
          <View style={styles.titleRow}>
            <Emblem course={course} size={44} radius={14} />
            <View style={styles.titleText}>
              <AppText variant="title" numberOfLines={2} style={styles.title}>
                {lesson.title}
              </AppText>
              {loaded && items.length ? (
                <ProgressBar
                  value={doneCount / items.length}
                  height={5}
                  fill={stone.moss}
                  track={stone.rockLight}
                  style={styles.statusBar}
                  accessibilityLabel={`${doneCount} of ${items.length} ${items.length === 1 ? "step" : "steps"} done`}
                />
              ) : null}
            </View>
          </View>
          {saved ? (
            <AppText variant="label" tone="accent" style={styles.saved}>
              {saved}
            </AppText>
          ) : null}
        </View>

        {state.phase === "loading" ? (
          <ActivityIndicator size="large" color={tokens.accent} style={styles.loading} />
        ) : null}
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
            foxKey={`chapter-${lesson.id}`}
            onPress={(i) => openItem(items[i])}
            items={items.map((item) => {
              const upNext = item.status === "next";
              const done = item.status === "done";
              if (item.kind === "stage") {
                const many = stages.length > 1;
                return {
                  id: `stage-${lesson.id}-${item.stageIndex}`,
                  status: item.status,
                  type: "questions",
                  kicker: `${item.size} questions`,
                  action: actionFor(item),
                  title: many ? `Questions · stage ${item.stageIndex + 1}` : "Questions",
                  caption: done ? "Done" : `${item.size} questions`,
                  accessibilityLabel: `Questions, stage ${item.stageIndex + 1}, ${item.size} questions${done ? ", done" : upNext ? ", up next" : ""}`,
                };
              }
              const isVideo = item.kind === "video";
              const { activity } = item.step;
              return {
                id: `activity-${activity.id}`,
                status: item.status,
                type: isVideo ? "video" : "reading",
                kicker: isVideo ? "Video" : "Reading",
                action: actionFor(item),
                title: activity.title,
                caption: done ? "Done" : isVideo ? "Video" : "Reading",
                accessibilityLabel: `${isVideo ? "Video" : "Reading"}: ${activity.title}${done ? ", done" : upNext ? ", up next" : ""}`,
              };
            })}
            den={{
              course,
              reached: ready ? chapterDone : !!lesson.completed || allDone,
              title: (ready ? chapterDone : !!lesson.completed || allDone) ? "Chapter complete" : "The den",
              caption: ready && !chapterDone ? "Score & XP" : lesson.title,
            }}
          />
        ) : null}
      </ScrollView>

      <StatusBarScrim visible={scrolled} color={stone.bg} />

      <Pressable
        onPress={onBack}
        hitSlop={space.sm}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${course?.title ?? "course"}`}
        style={({ pressed }) => [styles.back, { top: insets.top + space.sm }, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={22} color={tokens.text} />
      </Pressable>

      {footerButton ? (
        <View style={[styles.footer, { paddingBottom: space.lg + insets.bottom }]}>{footerButton}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: stone.bg,
  },

  header: {
    paddingHorizontal: layout.gutter,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },

  titleText: {
    flex: 1,
  },

  title: {
    fontSize: 22,
    lineHeight: 27,
  },

  statusBar: {
    marginTop: space.sm,
  },

  saved: {
    marginTop: space.sm,
  },

  loading: {
    marginTop: space.xxxl,
  },

  message: {
    paddingHorizontal: layout.gutter,
  },

  back: {
    position: "absolute",
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  pressed: {
    opacity: 0.7,
  },

  route: {
    marginTop: space.xl,
    marginHorizontal: layout.gutter,
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
