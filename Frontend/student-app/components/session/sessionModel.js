// The rules of a chapter's question session, as plain functions (no React)
// so they're easy to test.
//
// A chapter is a lesson. Its questions come from two existing endpoints —
// the lesson's quiz and its practice — shown as one session in the order
// the backend returns them: quiz questions first, then practice items.
//
// Feedback:
// - Choice questions (quiz, practice "choose") carry the correct option,
//   so they're marked right/wrong the moment the student taps.
// - Fill-in items have no answer key in the app, so they are only saved;
//   the server's total at the end includes them.

// A blank in a fill-in sentence is written as three or more underscores.
export const BLANK = /_{3,}/;

const normalize = (value) => (value ?? "").toString().trim().toLowerCase();

// A choice question whose two options are exactly True and False gets the
// true/false layout. There is no separate true/false type in the backend.
export function isTrueFalse(options) {
  if (!Array.isArray(options) || options.length !== 2) {
    return false;
  }
  const values = options.map(normalize).sort();
  return values[0] === "false" && values[1] === "true";
}

function choiceKind(options) {
  return isTrueFalse(options) ? "truefalse" : "choice";
}

const validIndex = (value, options) =>
  Number.isInteger(value) && value >= 0 && value < (options?.length ?? 0)
    ? value
    : null;

// quiz / practice are what services/api.js returns (or null when the lesson
// has none). Returns one list in backend order.
export function buildQuestions(quiz, practice) {
  const quizQuestions = (quiz?.questions ?? []).map((q) => ({
    key: `quiz-${q.id}`,
    source: "quiz",
    id: q.id,
    kind: choiceKind(q.options),
    prompt: q.question,
    sentence: null,
    options: q.options ?? [],
    correctIndex: validIndex(q.correctAnswer, q.options),
    explanation: q.explanation || null,
  }));

  const practiceItems = (practice?.activities ?? []).map((a) => {
    if (a.type === "fill") {
      return {
        key: `practice-${a.id}`,
        source: "practice",
        id: a.id,
        kind: "fill",
        prompt: a.question,
        sentence: a.sentence || null,
        options: [],
        correctIndex: null,
        explanation: a.explanation || null,
      };
    }
    return {
      key: `practice-${a.id}`,
      source: "practice",
      id: a.id,
      kind: choiceKind(a.options),
      prompt: a.question,
      sentence: a.sentence || null,
      options: a.options ?? [],
      correctIndex: validIndex(a.answer, a.options),
      explanation: a.explanation || null,
    };
  });

  return [...quizQuestions, ...practiceItems];
}

// For fill-in: the text that holds the blank (the sentence if it has one,
// otherwise the question), split around the first blank. null if no blank.
export function splitBlank(question) {
  const text = BLANK.test(question.sentence ?? "") ? question.sentence : question.prompt;
  if (!BLANK.test(text ?? "")) {
    return null;
  }
  const [before, ...rest] = text.split(BLANK);
  return { before, after: rest.join("____") };
}

// "correct" | "wrong" | "saved". answer is an option index for choice
// questions and the typed text for fill-in.
export function evaluate(question, answer) {
  if (question.kind === "fill" || question.correctIndex === null) {
    return "saved";
  }
  return answer === question.correctIndex ? "correct" : "wrong";
}

// What each existing submit endpoint expects. answers: { [key]: answer }
export function toSubmissions(questions, answers) {
  const quiz = [];
  const practice = [];

  for (const question of questions) {
    if (!(question.key in answers)) continue;
    const answer = answers[question.key];

    if (question.source === "quiz") {
      quiz.push({ questionId: question.id, selectedIndex: answer });
    } else if (question.kind === "fill") {
      practice.push({ itemId: question.id, textAnswer: answer, selectedIndex: null });
    } else {
      practice.push({ itemId: question.id, textAnswer: null, selectedIndex: answer });
    }
  }

  return { quiz, practice };
}

// Server results for the parts that were submitted. Score, total and XP
// are the server's numbers only.
export function combineResults(quizResult, practiceResult) {
  const parts = [quizResult, practiceResult].filter(Boolean);
  return {
    score: parts.reduce((sum, r) => sum + (r.score ?? 0), 0),
    total: parts.reduce((sum, r) => sum + (r.totalQuestions ?? r.totalItems ?? 0), 0),
    xp: parts.reduce((sum, r) => sum + (Number(r.xpEarned) || 0), 0),
  };
}

// Choice questions answered wrong, for the review on the results screen.
// Fill-in answers aren't listed: the app can't know which were right.
export function wrongChoices(questions, answers) {
  return questions
    .filter((q) => q.key in answers && evaluate(q, answers[q.key]) === "wrong")
    .map((q) => ({
      key: q.key,
      prompt: q.prompt,
      yourAnswer: q.options[answers[q.key]],
      correctAnswer: q.options[q.correctIndex],
      explanation: q.explanation,
    }));
}

// Chapters (lessons) of a course in order, across its modules.
export function flattenChapters(course) {
  return (course?.modules ?? []).flatMap((module) => module.lessons ?? []);
}

export function nextChapter(course, lessonId) {
  const chapters = flattenChapters(course);
  const index = chapters.findIndex((lesson) => lesson.id === lessonId);
  return index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null;
}

// The first chapter not done yet — the one to suggest next.
export function firstOpenChapter(course) {
  return flattenChapters(course).find((lesson) => !lesson.completed) ?? null;
}

// ---------- Stages ----------
// A chapter's questions are split, in order, into stages of STAGE_SIZE.
// Every stage is open. Stages are done in the app; the whole chapter is
// submitted once every question has an answer, because the server grades
// a chapter per submit (and each submit counts as a new attempt).

export const STAGE_SIZE = 10;

export function splitStages(questions, size = STAGE_SIZE) {
  const stages = [];
  for (let start = 0; start < questions.length; start += size) {
    stages.push({
      index: stages.length,
      questions: questions.slice(start, start + size),
    });
  }
  return stages;
}

export const isStageDone = (stage, answers) =>
  stage.questions.every((q) => q.key in answers);

export const allAnswered = (questions, answers) =>
  questions.length > 0 && questions.every((q) => q.key in answers);

// Path status of each stage: "done" (answered in this run, or the whole
// chapter is already complete on the server), "next" (the first one still
// to do) or "todo".
export function stageStatuses(stages, answers, chapterCompleted) {
  let nextMarked = false;
  return stages.map((stage) => {
    if (chapterCompleted || isStageDone(stage, answers)) return "done";
    if (!nextMarked) {
      nextMarked = true;
      return "next";
    }
    return "todo";
  });
}

// The stage to open when the student just wants to continue.
export function nextStageIndex(stages, answers) {
  const index = stages.findIndex((stage) => !isStageDone(stage, answers));
  return index === -1 ? 0 : index;
}

// A stage's own result, from the choice questions only (their answer key
// comes with the question). Fill-in answers are only counted as saved;
// the server's score at the end of the chapter includes them.
export function stageSummary(stage, answers) {
  let correct = 0;
  let graded = 0;
  let saved = 0;
  for (const q of stage.questions) {
    if (!(q.key in answers)) continue;
    const result = evaluate(q, answers[q.key]);
    if (result === "saved") saved += 1;
    else {
      graded += 1;
      if (result === "correct") correct += 1;
    }
  }
  return { correct, graded, saved };
}

// Keep only answers that still match a question of this chapter (content
// can change between visits).
export function validAnswers(questions, answers = {}) {
  const keys = new Set(questions.map((q) => q.key));
  return Object.fromEntries(Object.entries(answers).filter(([key]) => keys.has(key)));
}
