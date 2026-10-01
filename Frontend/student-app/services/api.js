import { supabase } from "../lib/supabase";
import { API_BASE_URL } from "../config";

// ---- Plumbing ------------------------------------------------------

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Every backend call goes through here. It attaches the current login
// token, and turns failures into readable messages.
async function request(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = {
    "Content-Type": "application/json",
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...options.headers,
  };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch (networkError) {
    throw new ApiError(
      "Can't reach the server. Check your connection and try again.",
      0,
    );
  }

  if (response.status === 401) {
    await supabase.auth.signOut();
    throw new ApiError("Your session expired. Please log in again.", 401);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      body?.detail || "Something went wrong.",
      response.status,
    );
  }

  return body;
}

const lessonPath = (lessonId) => `/lessons/${encodeURIComponent(lessonId)}`;

// The backend speaks snake_case and returns money-like numbers as strings.
// The screens were built for camelCase and real numbers, so translate once, here.
function mapCourse(course) {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    progress: course.progress,
    totalLessons: course.total_lessons,
    completedLessons: course.completed_lessons,
    modules: course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        duration: lesson.duration,
        videoUrl: lesson.video_url,
        completed: lesson.completed,
      })),
    })),
  };
}

// ---- Auth ----------------------------------------------------------

async function loadStudentUser() {
  const me = await request("/auth/me");

  if (me.role !== "student") {
    await supabase.auth.signOut();
    throw new Error(
      "This app is for students. Teachers should use the teacher dashboard.",
    );
  }

  return { id: me.id, name: me.name, email: me.email, role: me.role };
}

export async function loginUser(email, password) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.name === "AuthRetryableFetchError") {
      throw new Error(
        "Can't reach the server. Check your connection and try again.",
      );
    }
    throw new Error("Incorrect email or password.");
  }

  return loadStudentUser();
}

export async function logoutUser() {
  await supabase.auth.signOut();
  return true;
}

// On app start: if a saved session exists, skip the login screen.
export async function restoreSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  try {
    return await loadStudentUser();
  } catch (error) {
    return null;
  }
}

// ---- Student, courses, ranking ---------------------------------------

export async function fetchStudent() {
  const [me, stats] = await Promise.all([
    request("/auth/me"),
    request("/me/stats"),
  ]);

  return {
    id: me.id,
    name: me.name,
    email: me.email,
    role: me.role,
    xp: Number(stats.xp),
    streak: stats.current_streak,
    weeklyXp: Number(stats.weekly_xp),
    monthlyXp: Number(stats.monthly_xp),
  };
}

export async function fetchCourses() {
  const courses = await request("/courses");
  return courses.map(mapCourse);
}

export async function fetchRanking() {
  const rows = await request("/ranking");
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    xp: Number(row.xp),
    weeklyXp: Number(row.weekly_xp),
    monthlyXp: Number(row.monthly_xp),
  }));
}

// ---- Quiz ----------------------------------------------------------------

// Returns null when the lesson has no quiz yet (the screen shows "coming soon").
export async function fetchQuizByLessonId(lessonId) {
  try {
    const quiz = await request(`${lessonPath(lessonId)}/quiz`);
    return {
      lessonId: quiz.lesson_id,
      attemptNumber: quiz.attempt_number,
      xpPerCorrect: Number(quiz.xp_per_correct),
      questions: quiz.questions.map((question) => ({
        id: question.id,
        question: question.question,
        options: question.options,
        correctAnswer: question.correct_index,
        explanation: question.explanation,
      })),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

// answers: [{ questionId, selectedIndex }]. We send WHAT the student picked,
// never a score. The server grades it, works out the attempt number and the
// XP itself, records everything, and tells us the result.
export async function submitQuiz(lessonId, answers) {
  const result = await request(`${lessonPath(lessonId)}/quiz/submit`, {
    method: "POST",
    body: JSON.stringify({
      answers: answers.map((answer) => ({
        question_id: answer.questionId,
        selected_index: answer.selectedIndex,
      })),
    }),
  });

  return {
    attemptNumber: result.attempt_number,
    score: result.score,
    totalQuestions: result.total_questions,
    xpEarned: Number(result.xp_earned),
    xpPerCorrect: Number(result.xp_per_correct),
    nextXpPerCorrect: Number(result.next_xp_per_correct),
    allCorrect: result.all_correct,
  };
}

// ---- Practice -------------------------------------------------------------

export async function fetchPracticeByLessonId(lessonId) {
  try {
    const practice = await request(`${lessonPath(lessonId)}/practice`);
    return {
      lessonId: practice.lesson_id,
      title: practice.title,
      alreadyCompleted: practice.already_completed,
      activities: practice.items.map((item) => ({
        id: item.id,
        type: item.type,
        question: item.question,
        sentence: item.sentence,
        options: item.options,
        // The screen expects: a number (the right option's index) for
        // "choose", and the correct text for "fill".
        answer: item.type === "choose" ? item.correct_index : item.answer,
      })),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

// answers: [{ itemId, textAnswer, selectedIndex }]
export async function submitPractice(lessonId, answers) {
  const result = await request(`${lessonPath(lessonId)}/practice/submit`, {
    method: "POST",
    body: JSON.stringify({
      answers: answers.map((answer) => ({
        item_id: answer.itemId,
        text_answer: answer.textAnswer,
        selected_index: answer.selectedIndex,
      })),
    }),
  });

  return {
    score: result.score,
    totalItems: result.total_items,
    xpEarned: Number(result.xp_earned),
    xpPossible: Number(result.xp_possible),
    isFirstCompletion: result.is_first_completion,
  };
}
