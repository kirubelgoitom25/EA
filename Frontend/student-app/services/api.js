// ============================================================
// Data access layer — the ONLY file that should change when we
// swap mock data for real Supabase calls.
//
// Every function here is already async (returns a Promise), even
// though today it just wraps the local mock data instantly. That
// means every screen that calls these functions already works the
// same way it will once Supabase is wired in — no screen code
// needs to change when that happens, only the function bodies in
// this file do.
//
// HOW TO MIGRATE LATER:
// Each function below has a comment showing roughly what the real
// Supabase call will look like. The backend developer's schema
// should match the shapes documented in BACKEND_SPEC.md so these
// functions can be swapped in directly.
// ============================================================

import {
  student as mockStudent,
  courses as mockCourses,
  ranking as mockRanking,
  quizzes as mockQuizzes,
  practices as mockPractices,
} from "../data/mockData";

// ---- Auth -----------------------------------------------------

export async function loginUser(email, password) {
  // FUTURE: const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  return {
    id: mockStudent.id,
    name: mockStudent.name,
    email,
    role: mockStudent.role,
  };
}

export async function logoutUser() {
  // FUTURE: await supabase.auth.signOut();
  return true;
}

// ---- Student / profile -----------------------------------------

export async function fetchStudent() {
  // FUTURE: const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return { ...mockStudent };
}

// Called after a quiz or practice completes. Should persist the
// new XP total AND log the individual event (see BACKEND_SPEC.md —
// we need an xp_events table, not just a running total, so the
// diminishing-return retry logic and weekly/monthly XP can be
// computed correctly).
export async function addXp(studentId, amount, source) {
  // FUTURE: await supabase.from("xp_events").insert({ student_id: studentId, amount, source });
  return { success: true, amount, source };
}

// ---- Courses ----------------------------------------------------

export async function fetchCourses() {
  // FUTURE: const { data } = await supabase.from("courses").select("*, modules(*, lessons(*))");
  return mockCourses.map((course) => ({ ...course }));
}

export async function markLessonCompleted(lessonId) {
  // FUTURE: await supabase.from("lesson_progress").upsert({ student_id, lesson_id: lessonId, completed: true });
  return { success: true, lessonId };
}

// ---- Quizzes ------------------------------------------------------

export async function fetchQuizByLessonId(lessonId) {
  // FUTURE: const { data } = await supabase.from("quizzes").select("*, questions(*)").eq("lesson_id", lessonId).single();
  return mockQuizzes.find((quiz) => quiz.lessonId === lessonId) || null;
}

// Returns how many times this student has attempted this lesson's
// quiz — drives the diminishing XP rate (10 / 5 / 2.5 / 1).
export async function fetchQuizAttemptCount(studentId, lessonId) {
  // FUTURE: const { count } = await supabase.from("quiz_attempts").select("*", { count: "exact" }).eq("student_id", studentId).eq("lesson_id", lessonId);
  return 0; // mock: always "first attempt" since we track attempts client-side today
}

export async function recordQuizAttempt(studentId, lessonId, score, xpEarned) {
  // FUTURE: await supabase.from("quiz_attempts").insert({ student_id: studentId, lesson_id: lessonId, score, xp_earned: xpEarned });
  return { success: true };
}

// ---- Practice -----------------------------------------------------

export async function fetchPracticeByLessonId(lessonId) {
  // FUTURE: const { data } = await supabase.from("practices").select("*, activities(*)").eq("lesson_id", lessonId).single();
  return mockPractices.find((practice) => practice.lessonId === lessonId) || null;
}

export async function recordPracticeAttempt(studentId, lessonId, score, xpEarned) {
  // FUTURE: await supabase.from("practice_attempts").insert({ student_id: studentId, lesson_id: lessonId, score, xp_earned: xpEarned });
  return { success: true };
}

// ---- Ranking / leaderboard -----------------------------------------

// period is "weekly" | "monthly" | "overall"
export async function fetchRanking(period = "overall") {
  // FUTURE: query a view/RPC that sums xp_events within the right date range, per student.
  return mockRanking.map((item) => ({ ...item }));
}

// ---- Temporary synchronous re-exports ---------------------------
// A few screens (Quiz, Practice, Ranking, Home) still read these
// arrays directly at import time rather than through the async
// fetch* functions above. Re-exporting them from here — instead of
// importing data/mockData.js directly — means every screen already
// points at this one file, so finishing the migration later is a
// per-screen conversion to fetchQuizByLessonId/fetchPracticeByLessonId/
// fetchRanking inside a useEffect, not a hunt through the codebase
// for stray mockData imports.
export { ranking, quizzes, practices } from "../data/mockData";