// Course Studio lessons hold ordered activities (video, quiz, practice, reading).
// The app's chapter keeps quiz and practice as ONE trail of question stages, so they fold into
// a single "questions" step. Video and reading stay separate steps, in the teacher's order.
// Plain functions (no React) so they are easy to test.

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// The 11-character video id of a YouTube link, or null. Same links the teacher site accepts.
export function youtubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    let id = "";
    if (parsed.hostname === "youtu.be") id = parsed.pathname.replace(/^\//, "");
    else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname)) {
      if (parsed.pathname === "/watch") id = parsed.searchParams.get("v") ?? "";
      else if (parsed.pathname.startsWith("/embed/")) id = parsed.pathname.slice("/embed/".length);
    }
    return YOUTUBE_ID.test(id) ? id : null;
  } catch (error) {
    return null;
  }
}

// activities: what GET /lessons/{id}/activities returned (already in order, archived left out).
// Returns [{ type: "video" | "reading", activity } | { type: "questions", activities }] where a
// quiz/practice with no questions yet (ready === false) is skipped.
export function buildSteps(activities) {
  const steps = [];
  let questions = null;
  for (const activity of activities ?? []) {
    if (activity.kind === "video" || activity.kind === "reading") {
      steps.push({ type: activity.kind, activity });
    } else if (activity.ready) {
      if (!questions) {
        questions = { type: "questions", activities: [] };
        steps.push(questions);
      }
      questions.activities.push(activity);
    }
  }
  return steps;
}

// Steps that come before / after the question trail, which the chapter screen draws itself.
export function splitAroundQuestions(steps) {
  const at = steps.findIndex((step) => step.type === "questions");
  if (at < 0) return { before: steps, hasQuestions: false, after: [] };
  return { before: steps.slice(0, at), hasQuestions: true, after: steps.slice(at + 1) };
}

export const hasOwnSteps = (steps) => steps.some((step) => step.type !== "questions");

// What to offer after finishing an activity: the next step of the chapter that is not done yet,
// in the teacher's order. Returns { type: "video" | "reading", activity } | { type: "questions" }
// | null (nothing left). questionsDone: every question stage of the chapter is answered.
export function nextStepAfter(steps, activityId, { questionsDone = false } = {}) {
  const at = steps.findIndex((step) => step.activity?.id === activityId);
  if (at < 0) return null;
  for (const step of steps.slice(at + 1)) {
    if (step.type === "questions") {
      if (!questionsDone) return { type: "questions" };
    } else if (!step.activity.completed) {
      return step;
    }
  }
  return null;
}
