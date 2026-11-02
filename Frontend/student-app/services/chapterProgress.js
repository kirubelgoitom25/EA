import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  fetchPracticeByLessonId,
  fetchQuizByLessonId,
  submitPractice,
  submitQuiz,
} from "./api";
import {
  buildQuestions,
  combineResults,
  toSubmissions,
  validAnswers,
} from "../components/session/sessionModel";

// ---------- Questions ----------
// A chapter's questions come from its quiz and its practice. Loaded once
// and shared by the chapter path and its stages; cleared after a submit.

const questionCache = new Map(); // lessonId -> Promise<questions>

export function loadChapterQuestions(lessonId) {
  if (!questionCache.has(lessonId)) {
    const promise = Promise.all([
      fetchQuizByLessonId(lessonId),
      fetchPracticeByLessonId(lessonId),
    ]).then(([quiz, practice]) => buildQuestions(quiz, practice));
    // A failed load isn't cached, so "Try again" really retries.
    promise.catch(() => questionCache.delete(lessonId));
    questionCache.set(lessonId, promise);
  }
  return questionCache.get(lessonId);
}

// ---------- Saved answers ----------
// Answers of the stages a student has done, saved on the phone until the
// whole chapter is submitted. { answers: { [questionKey]: answer }, stageCount }

const keyFor = (userId, lessonId) => `ea.chapter.v1.${userId}.${lessonId}`;

export async function loadProgress(userId, lessonId) {
  try {
    const saved = await AsyncStorage.getItem(keyFor(userId, lessonId));
    if (saved) return JSON.parse(saved);
  } catch (error) {
    // Unreadable: start fresh.
  }
  return { answers: {}, stageCount: 0 };
}

export async function saveProgress(userId, lessonId, progress) {
  try {
    await AsyncStorage.setItem(keyFor(userId, lessonId), JSON.stringify(progress));
  } catch (error) {
    // Not fatal: answers stay in memory for this session.
  }
}

export async function clearProgress(userId, lessonId) {
  try {
    await AsyncStorage.removeItem(keyFor(userId, lessonId));
  } catch (error) {
    // Ignore.
  }
}

// Saved progress for many chapters at once (for the course screen).
// Returns { [lessonId]: { answered, stageCount } }.
export async function loadProgressSummary(userId, lessonIds) {
  try {
    const pairs = await AsyncStorage.multiGet(lessonIds.map((id) => keyFor(userId, id)));
    const summary = {};
    pairs.forEach(([, value], index) => {
      if (!value) return;
      const progress = JSON.parse(value);
      summary[lessonIds[index]] = {
        answered: Object.keys(progress.answers ?? {}).length,
        stageCount: progress.stageCount ?? 0,
        stagesDone: progress.stagesDone ?? 0,
      };
    });
    return summary;
  } catch (error) {
    return {};
  }
}

// ---------- Submitting a chapter ----------
// Sends every answer of the chapter through the existing endpoints, once.
// `done` holds parts that already succeeded, so a retry never sends them
// twice. Returns { results, failed } — failed lists parts to retry.

export async function submitChapter(lessonId, questions, answers, done = {}) {
  const { quiz, practice } = toSubmissions(questions, validAnswers(questions, answers));
  const results = { quiz: done.quiz ?? null, practice: done.practice ?? null };
  const failed = [];

  if (quiz.length && !results.quiz) {
    try {
      results.quiz = await submitQuiz(lessonId, quiz);
    } catch (error) {
      failed.push("quiz");
    }
  }
  if (practice.length && !results.practice) {
    try {
      results.practice = await submitPractice(lessonId, practice);
    } catch (error) {
      failed.push("practice");
    }
  }

  if (!failed.length) {
    // Attempt numbers (and so XP rates) change after a submit.
    questionCache.delete(lessonId);
  }

  return { results, failed, total: combineResults(results.quiz, results.practice) };
}
