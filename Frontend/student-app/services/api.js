import { supabase } from "../lib/supabase";
import { API_BASE_URL } from "../config";
import { isEmailLogin, normalizePhone, signUpOutcome } from "./authModel";
import { createResponseCache, createShortReuse, sameInputSameOutput } from "./responseCache";



// The backend sends this exact text when an account has been turned off.
const ACCOUNT_OFF = "This account is turned off.";
export const ACCOUNT_OFF_TEXT =
  "This account has been turned off. Please contact your teacher.";
// The free server can take a while to wake up, and photos go over slow connections.
const UPLOAD_TIMEOUT_MS = 120000;

// ---- Plumbing ------------------------------------------------------

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// The last answer to each GET with its ETag (see responseCache.js).
const responses = createResponseCache();

// Every backend call goes through here. It attaches the current login
// token, and turns failures into readable messages.
async function request(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isGet = !options.method || options.method.toUpperCase() === "GET";
  const kept = isGet && !options.fresh ? responses.get(path) : null;

  const headers = {
    "Content-Type": "application/json",
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(kept ? { "If-None-Match": kept.etag } : {}),
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

  // Nothing changed since the kept answer: use it, no body was sent.
  if (response.status === 304) {
    if (kept) return kept.body;
    responses.delete(path);
    return request(path, { ...options, fresh: true });
  }

  const body = await response.json().catch(() => null);
  const result = await readResult(response.status, body);
  if (isGet) responses.set(path, response.headers?.get?.("etag"), body);
  return result;
}

// Everything kept for the signed-in student. Called on every sign-out.
export function forgetCachedResponses() {
  responses.clear();
  recentActivities.clear();
  mapCourses.reset();
  mapStats.reset();
}

// What every call does with the server's answer.
async function readResult(status, body) {
  if (status === 401) {
    await supabase.auth.signOut();
    throw new ApiError("Your session expired. Please log in again.", 401);
  }

  // Turned-off account: sign out and say why. The accountOff flag lets the
  // screens show one clear message.
  if (status === 403 && body?.detail === ACCOUNT_OFF) {
    await supabase.auth.signOut();
    const error = new ApiError(ACCOUNT_OFF_TEXT, 403);
    error.accountOff = true;
    throw error;
  }

  if (status < 200 || status >= 300) {
    throw new ApiError(body?.detail || "Something went wrong.", status);
  }

  return body;
}

// Sends a local file. Not fetch: Expo's fetch refuses React Native's { uri } file parts, and
// XMLHttpRequest streams the file from disk without loading it into memory.
async function uploadFile(path, form) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { status, body } = await new Promise((resolve, reject) => {
    const offline = () =>
      reject(new ApiError("Can't reach the server. Check your connection and try again.", 0));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${path}`);
    if (session) xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.onerror = offline;
    xhr.ontimeout = offline;
    xhr.onload = () => {
      let parsed = null;
      try {
        parsed = JSON.parse(xhr.responseText);
      } catch (error) {
        // no JSON body
      }
      resolve({ status: xhr.status, body: parsed });
    };
    xhr.send(form);
  });

  return readResult(status, body);
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
    price: Number(course.price ?? 0),
    currency: course.currency ?? "ETB",
    accessDays: course.access_days ?? null,
    paymentInstructions: course.payment_instructions ?? "",
    // free, paid or pro. Older servers send none: the price decides, as before.
    accessTier: course.access_tier ?? (Number(course.price ?? 0) > 0 ? "paid" : "free"),
    purchasable: course.purchasable ?? true,
    access: course.access
      ? {
          state: course.access.state,
          expiresAt: course.access.expires_at,
          pendingRequests: course.access.pending_requests ?? 0,
        }
      : null,
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

export async function loadStudentUser() {
  const me = await request("/auth/me");

  if (me.role !== "student") {
    await supabase.auth.signOut();
    throw new Error(
      "This app is for students. Teachers should use the teacher dashboard.",
    );
  }

  return mapMe(me);
}

// Pro, as the screens read it. Older servers send none: no Pro.
export function mapPro(pro) {
  return {
    state: pro?.state ?? "none",
    active: Boolean(pro?.active),
    expiresAt: pro?.expires_at ?? null,
  };
}

function mapMe(me) {
  return {
    id: me.id,
    name: me.name,
    // Students who signed up by phone have a hidden internal address. It's never shown.
    email: me.username ? null : me.email,
    role: me.role,
    username: me.username ?? null,
    phone: me.phone ?? null,
    // null on older servers: then nothing is asked.
    profileComplete: me.profile_complete ?? null,
    pro: mapPro(me.pro),
  };
}

// Fresh account facts (Pro can change after a payment is approved).
export async function fetchMe() {
  return mapMe(await request("/auth/me", { fresh: true }));
}

// Phone or username in, the address Supabase knows the account by out. An email passes as is.
async function loginEmailFor(identifier) {
  const trimmed = identifier.trim();
  if (isEmailLogin(trimmed)) return trimmed;
  const { email } = await request("/auth/resolve-login", {
    method: "POST",
    body: JSON.stringify({ identifier: normalizePhone(trimmed) ?? trimmed }),
  });
  return email;
}

export async function loginUser(identifier, password) {
  if (!identifier || !password) {
    throw new Error("Enter your phone number or username, and your password.");
  }

  const email = await loginEmailFor(identifier);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.name === "AuthRetryableFetchError") {
      throw new Error(
        "Can't reach the server. Check your connection and try again.",
      );
    }
    // A banned account gets a clear message instead of "wrong password".
    if (error.code === "user_banned" || /banned/i.test(error.message || "")) {
      throw new Error(ACCOUNT_OFF_TEXT);
    }
    if (error.code === "email_not_confirmed") {
      const unconfirmed = new Error("Confirm your email first.");
      unconfirmed.needsConfirmation = true;
      throw unconfirmed;
    }
    throw new Error(
      isEmailLogin(identifier)
        ? "Incorrect email or password."
        : "Incorrect phone number, username or password.",
    );
  }

  return loadStudentUser();
}

// A new student account. The server checks everything and creates it; then we sign in with the
// hidden address it answers with. The student only ever sees their phone and username.
export async function registerStudent({ username, phone, password, school }) {
  const { login_email: email } = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username: username.trim(),
      phone: normalizePhone(phone) ?? phone.trim(),
      password,
      school: school.trim(),
    }),
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // The account exists; only signing in failed (most likely the connection).
    throw new Error("Your account was created. Please log in with your phone number and password.");
  }
  return loadStudentUser();
}

export async function fetchMyProfile() {
  const p = await request("/me/profile", { fresh: true });
  return { username: p.username, phone: p.phone, school: p.school, profileComplete: p.profile_complete };
}

// Only the fields given are changed.
export async function updateMyProfile(values) {
  const body = {};
  if (values.username !== undefined) body.username = values.username.trim();
  if (values.phone !== undefined) body.phone = normalizePhone(values.phone) ?? values.phone.trim();
  if (values.school !== undefined) body.school = values.school.trim();
  const p = await request("/me/profile", { method: "PATCH", body: JSON.stringify(body) });
  return { username: p.username, phone: p.phone, school: p.school, profileComplete: p.profile_complete };
}

function authError(error) {
  if (error.name === "AuthRetryableFetchError") {
    return new Error("Can't reach the server. Check your connection and try again.");
  }
  if (error.code === "over_email_send_rate_limit") {
    return new Error("Too many emails sent. Please wait a minute and try again.");
  }
  if (error.code === "signup_disabled") {
    return new Error("New accounts aren't open yet. Please try again soon.");
  }
  return new Error(error.message || "Something went wrong. Please try again.");
}

// Returns "signedIn" (with the user), "verify" (a code was emailed) or "exists". Every new account
// is a student: the database decides that, and nothing sent here can change it.
export async function signUpUser({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) throw authError(error);
  const outcome = signUpOutcome(data);
  return { outcome, user: outcome === "signedIn" ? await loadStudentUser() : null };
}

export async function verifySignUpCode(email, code) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
  if (error) throw new Error("That code didn't work. Check it, or send a new one.");
  return loadStudentUser();
}

export async function resendSignUpCode(email) {
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) throw authError(error);
}

export async function sendPasswordResetCode(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw authError(error);
}

export async function resetPassword(email, code, password) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "recovery" });
  if (error) throw new Error("That code didn't work. Check it, or send a new one.");
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) throw authError(updateError);
  return loadStudentUser();
}

export async function logoutUser() {
  forgetCachedResponses();
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
    // Let the app say why, if the account was turned off.
    if (error.accountOff) {
      throw error;
    }
    return null;
  }
}

// ---- Student, courses, ranking ---------------------------------------

const mapStats = sameInputSameOutput((stats) => ({
  // Servers from before this field send no name; the login's name is used then.
  name: stats.name ?? null,
  xp: Number(stats.xp),
  streak: stats.current_streak,
  weeklyXp: Number(stats.weekly_xp),
  monthlyXp: Number(stats.monthly_xp),
}));

// XP, streak and the current name. One request: who the student is (id, email, role) is
// already known from the login, and every request re-checks the account anyway.
export async function fetchStats() {
  return mapStats(await request("/me/stats"));
}

// The student as the screens show them: the login's identity plus fresh stats.
export function composeStudent(user, stats) {
  return {
    id: user.id,
    name: stats.name ?? user.name,
    email: user.email,
    role: user.role,
    username: user.username ?? null,
    pro: user.pro ?? mapPro(null),
    xp: stats.xp,
    streak: stats.streak,
    weeklyXp: stats.weeklyXp,
    monthlyXp: stats.monthlyXp,
  };
}

export async function fetchStudent(user) {
  return composeStudent(user, await fetchStats());
}

const mapCourses = sameInputSameOutput((courses) =>
  Array.isArray(courses) ? courses.map(mapCourse) : [],
);

export async function fetchCourses() {
  return mapCourses(await request("/courses"));
}

export async function fetchRanking(scope = "class", period = "weekly") {
  const result = await request(
    `/ranking?scope=${encodeURIComponent(scope)}&period=${encodeURIComponent(period)}`
  );
  const sourceEntries = Array.isArray(result)
    ? result
    : Array.isArray(result?.entries)
    ? result.entries
    : [];
  const numberOrZero = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };
  const entries = sourceEntries.map((row) => {
    const xp = numberOrZero(row?.xp);
    const weeklyXp = numberOrZero(row?.weekly_xp ?? row?.weeklyXp);
    const monthlyXp = numberOrZero(row?.monthly_xp ?? row?.monthlyXp);
    const periodXp = numberOrZero(
      row?.period_xp ??
        (period === "weekly"
          ? weeklyXp
          : period === "monthly"
          ? monthlyXp
          : xp)
    );
    return {
      id: row?.id ?? "",
      name: row?.name ?? "",
      pro: Boolean(row?.pro),
      xp,
      weeklyXp,
      monthlyXp,
      periodXp,
      position: numberOrZero(row?.position),
    };
  });
  const sessionResult = Array.isArray(result)
    ? null
    : result && typeof result === "object"
    ? result
    : null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const ownEntry = entries.find((entry) => entry.id === session?.user?.id);
  const sortedEntries = [...entries].sort(
    (a, b) => b.periodXp - a.periodXp || a.name.localeCompare(b.name)
  );
  const derivedPosition = ownEntry
    ? sortedEntries.findIndex((entry) => entry.id === ownEntry.id) + 1
    : null;
  const responsePosition = numberOrZero(sessionResult?.your_position);
  return {
    entries,
    yourPosition:
      responsePosition || numberOrZero(ownEntry?.position) || derivedPosition,
    yourXp: numberOrZero(sessionResult?.your_xp ?? ownEntry?.periodXp),
  };
}

// ---- Payment requests ------------------------------------------------------

// The Pro plans on offer, cheapest first as the admin ordered them.
export async function fetchPlans() {
  const plans = await request("/plans");
  return (plans ?? []).map((plan) => ({
    id: plan.id,
    title: plan.title,
    price: Number(plan.price),
    currency: plan.currency ?? "ETB",
    accessDays: plan.access_days,
    paymentInstructions: plan.payment_instructions ?? "",
  }));
}

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

// image: what the photo picker returned. Only the image is sent. The server reads the price,
// currency and duration from the course itself.
export async function submitPaymentRequest(courseId, image) {
  const form = new FormData();
  form.append("proof", {
    uri: image.uri,
    name: image.fileName || "payment.jpg",
    type: image.mimeType || "image/jpeg",
  });
  return uploadFile(`/courses/${encodeURIComponent(courseId)}/payment-requests`, form);
}

// Same as a course: only the image is sent; the price comes from the plan on the server.
export async function submitPlanRequest(planId, image) {
  const form = new FormData();
  form.append("proof", {
    uri: image.uri,
    name: image.fileName || "payment.jpg",
    type: image.mimeType || "image/jpeg",
  });
  return uploadFile(`/plans/${encodeURIComponent(planId)}/payment-requests`, form);
}

export async function fetchMyPaymentRequests() {
  const requests = await request("/me/payment-requests");
  return (requests ?? []).map((row) => ({
    id: row.id,
    kind: row.kind ?? "course",
    planId: row.plan_id ?? null,
    courseId: row.course_id,
    courseTitle: row.course_title,
    status: row.status,
    amount: Number(row.amount),
    currency: row.currency,
    accessDays: row.access_days ?? null,
    reviewNote: row.review_note,
    createdAt: row.created_at,
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
// submissionId: the same for every try of one chapter submission, so a retry is never
// recorded twice (see chapterProgress.submissionIdFor).
export async function submitQuiz(lessonId, answers, submissionId = null) {
  recentActivities.clear(); // a submit completes the quiz activity
  const result = await request(`${lessonPath(lessonId)}/quiz/submit`, {
    method: "POST",
    body: JSON.stringify({
      answers: answers.map((answer) => ({
        question_id: answer.questionId,
        selected_index: answer.selectedIndex,
      })),
      ...(submissionId ? { submission_id: submissionId } : {}),
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

        // Shown after the student answers.
        explanation: item.explanation,
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
export async function submitPractice(lessonId, answers, submissionId = null) {
  recentActivities.clear();
  const result = await request(`${lessonPath(lessonId)}/practice/submit`, {
    method: "POST",
    body: JSON.stringify({
      answers: answers.map((answer) => ({
        item_id: answer.itemId,
        text_answer: answer.textAnswer,
        selected_index: answer.selectedIndex,
      })),
      ...(submissionId ? { submission_id: submissionId } : {}),
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

// ---- Lesson activities (Course Studio) -----------------------------------------------

// The lesson's ordered activities. Returns null when the server has none to give (a lesson that
// is not open to this student, or a server without Course Studio yet), so older chapters keep
// working exactly as before.
// Opening a chapter asks for its activities twice in a row (to pick the screen, then the
// screen itself), so an answer is shared for a few seconds. Completing anything clears it.
const recentActivities = createShortReuse(5000);

export function fetchLessonActivities(lessonId) {
  return recentActivities.run(lessonId, () => loadLessonActivities(lessonId));
}

async function loadLessonActivities(lessonId) {
  try {
    const result = await request(`${lessonPath(lessonId)}/activities`);
    return {
      lessonCompleted: result.lesson_completed,
      activities: result.activities.map((activity) => ({
        id: activity.id,
        kind: activity.kind,
        title: activity.title,
        isRequired: activity.is_required,
        completed: activity.completed,
        ready: activity.ready,
        videoUrl: activity.video_url,
        readingBody: activity.reading_body,
      })),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

// The explicit "Mark complete" for a video or reading. Opening one never counts.
export async function completeActivity(activityId) {
  recentActivities.clear();
  const result = await request(`/activities/${encodeURIComponent(activityId)}/complete`, {
    method: "POST",
  });
  return { completed: result.completed, lessonCompleted: result.lesson_completed };
}

// ---- Presence -------------------------------------------------------------

// Tells the teacher dashboard that the student has the app open. lessonId is
// the lesson whose screen is open right now, or null.
//
// This is best effort and is deliberately silent: it never shows an error,
// and it never signs the student out (unlike request(), which does on a 401).
export async function sendHeartbeat(lessonId = null) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return;
  }

  try {
    await fetch(`${API_BASE_URL}/me/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ lesson_id: lessonId }),
    });
  } catch (error) {
    // Offline or the server is busy: try again at the next beat.
  }
}
