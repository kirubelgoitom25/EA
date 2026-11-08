import { allAnswered, splitStages, stageStatuses } from "./session/sessionModel.js";

// A chapter's path, worked out from what was loaded for it (pure, so the course page can work it out
// too, ahead of opening the chapter: the chapter-to-lessons move needs to know where the current
// lesson will be). This is ChapterPathScreen's own logic, unchanged, in one place.
//
// state: { phase, questions, steps, answers } as ChapterPathScreen loads it; lesson: the chapter.
// Returns what the screen uses, with routeItems (the steps as Route draws them) and den.
export function chapterPath(state, lesson) {
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

  const actionFor = (item) =>
    item.kind === "video"
      ? "Watch video"
      : item.kind === "reading"
        ? "Read"
        : anyStarted ? "Continue" : "Start";

  const routeItems = items.map((item) => {
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
  });

  const denReached = ready ? chapterDone : !!lesson.completed || allDone;
  const den = {
    reached: denReached,
    title: denReached ? "Chapter complete" : "The den",
    caption: ready && !chapterDone ? "Score & XP" : lesson.title,
  };

  return { loaded, ready, steps, stages, anyStarted, chapterDone, showComplete, statuses, pendingSave, questionsDone, items, nextAt, doneCount, allDone, routeItems, den };
}
