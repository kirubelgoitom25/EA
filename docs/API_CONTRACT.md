# EA API Contract v0.2

This file is the source of truth. If the backend and this file disagree,
the file wins until both developers agree to change it.

## Authentication
The backend does not issue tokens. Sign in directly with Supabase:

    supabase.auth.signInWithPassword({ email, password })

This returns a `session.access_token`. Send it on every backend request:

    Authorization: Bearer <access_token>

Token lifetime is controlled by Supabase (1 hour by default). If a
request returns 401, refresh the session via the Supabase client, or
send the user back to the login screen if that fails.

## Roles
Exact lowercase strings: `student` and `teacher`.
New accounts always start as `student`. There is no public endpoint to
become a teacher, it is a manual database change.

## Errors
The body is always `{"detail": "<message>"}`, and `detail` is always a string.

- 401: missing, invalid, or expired token
- 403: logged in but wrong role
- 404: not found
- 422: invalid input

## GET /auth/me
Any logged-in user, returns their own info.

200:

    { "id": "b3f1c2a0-...", "name": "Sara", "email": "sara@ea.test", "role": "student" }

401: `{"detail": "Invalid or expired token"}`

## GET /students
Teacher only.

200:

    [
      {
        "id": "b3f1c2a0-...",
        "name": "Sara",
        "email": "sara@ea.test",
        "role": "student",
        "is_active": true,
        "created_at": "2026-09-19T10:00:00Z"
      }
    ]

403: `{"detail": "Teachers only"}`

## GET /students/{id}
Teacher only, including a student looking up their own id.
Students use GET /auth/me for their own info instead.

- 200: one student object, same shape as above
- 404: `{"detail": "Student not found"}`
- 403: `{"detail": "Teachers only"}`

## Course Studio

**Requires the Course Studio database migration** (`supabase/pending/`). The
backend must be deployed after it, never before.

Shape: Course -> Chapters (`modules`) -> Lessons -> ordered Activities. An
activity `kind` is `video`, `quiz`, `practice` or `reading`. One quiz and one
practice per lesson; any number of videos and readings. Every older student
route keeps its shape and behaviour (see "Unchanged" below).

### Who can do what
- A course has an optional `owner_id` and a `status`: `draft`, `published`,
  `unpublished`. The six original courses are ownerless and `published`.
- Any teacher can create a course (it starts as a private `draft`) and publish
  it. Only the owner edits an owned course. An ownerless course is edited by the
  teachers of a class that has it, as before. Everything else answers 404.
- Ownerless courses cannot be published, unpublished or deleted: 403.
- Students see: courses given to their class (never drafts), every published
  owned course, and an unpublished owned course they already have progress in.
- `is_required` is advisory (default `false`). It never blocks anything.

### Teacher routes (teacher only; 404 when not yours)
| Method and path | Body | Result |
|---|---|---|
| `GET /teacher/courses` | | Courses you own or teach, with `owned` and `editable` |
| `POST /teacher/courses` | `{title, description}` | 201, a `draft` owned by you |
| `GET /teacher/courses/{id}` | | Full outline: modules, lessons, activities (archived included, flagged) |
| `PATCH /teacher/courses/{id}` | `{title?, description?}` | Course |
| `POST /teacher/courses/{id}/publish` | | Course. 422 if it has no lesson. 409 if already published |
| `POST /teacher/courses/{id}/unpublish` | | Course. 409 unless published |
| `DELETE /teacher/courses/{id}` | | `{deleted, archived}`. 409 if any student has progress: unpublish instead |
| `GET /teacher/courses/{id}/stats` | | Owner only. `{learners, completed_course, hidden, min_aggregate}` |
| `GET /teacher/courses/{id}/classes` | | Owner only. Each class you teach: `{class_id, name, assigned, students, learners, completed_course}`. These are that class's own numbers (not hidden), separate from `/stats` |
| `PUT /teacher/courses/{id}/classes/{class_id}` | | Owner only. Gives the course to a class you teach (same entry as `class_courses`), so its progress shows on that class's pages. Safe to repeat. 404 for a class you don't teach |
| `DELETE /teacher/courses/{id}/classes/{class_id}` | | Takes it back. Students keep their progress. A free published course stays open to them; a paid one closes unless they bought it |
| `POST /teacher/courses/{id}/modules` | `{title}` | 201 |
| `PUT /teacher/courses/{id}/modules/order` | `{ids: [module ids]}` | Every non-archived module exactly once, else 422 |
| `PATCH /teacher/modules/{id}` | `{title?, archived?}` | Module |
| `DELETE /teacher/modules/{id}` | | `{deleted, archived}` |
| `POST /teacher/modules/{id}/lessons` | `{title, duration?}` | 201 |
| `PUT /teacher/modules/{id}/lessons/order` | `{ids: [lesson ids]}` | Same rule |
| `PATCH /teacher/lessons/{id}` | `{title?, duration?, archived?}` | Lesson |
| `DELETE /teacher/lessons/{id}` | | `{deleted, archived}` |
| `GET /teacher/lessons/{id}/activities` | | Ordered list, archived included |
| `POST /teacher/lessons/{id}/activities` | `{kind, title?, is_required?, video_url?, reading_body?}` | 201. `video` needs a YouTube `video_url`, `reading` needs `reading_body`; other fields refused. 409 if the lesson already has that quiz/practice |
| `PUT /teacher/lessons/{id}/activities/order` | `{ids: [activity ids]}` | Every non-archived activity exactly once, else 422 |
| `PATCH /teacher/activities/{id}` | `{title?, is_required?, video_url?, reading_body?, archived?}` | Activity |
| `DELETE /teacher/activities/{id}` | | `{deleted, archived}` |

Quiz and practice questions are still edited with the existing
`/teacher/lessons/{id}/quiz...` and `/practice...` routes. Creating questions
there also creates the lesson's quiz/practice activity.

**Nothing is hard-deleted that a student has touched.** A `DELETE` removes the
row only when no student has progress or an attempt on it; otherwise it sets it
to archived and answers `{"deleted": false, "archived": true}`. Quiz and practice
activities are always archived, never deleted. Archived items disappear for
students and keep all their records.

Counts under 3 learners come back as `null` with `hidden: true`. No student is
ever identified; per-class numbers stay under `/classes`.

### Student routes (student only)
`GET /lessons/{lesson_id}/activities` returns
`{lesson_id, lesson_completed, activities: [{id, kind, title, sort_order,
is_required, completed, ready, video_url, reading_body}]}` in order, archived
ones left out. `ready` is `false` for a quiz/practice with no questions yet.
Opening this list never completes anything. 404 when the lesson is not open to
the student (draft, other class, archived).

`POST /activities/{activity_id}/complete` is the explicit **Mark Complete** for a
`video` or `reading`. It records the activity and completes the lesson (the same
`lesson_progress` row the quiz and practice routes write). Repeating it is safe.
`quiz` and `practice` answer 422: they complete by submitting, as before.

Completing any activity completes the lesson. `is_required` plays no part.

### Video links
`lessons.video_url` stays in the existing course payload. Video activities are
the source of truth: it always equals the first active video activity's URL, or
`null` when there is none (an archived video keeps its URL on the activity).

### Unchanged
`GET /courses`, `GET /courses/{id}`, `GET /lessons/{id}/quiz`, `POST
.../quiz/submit`, `GET /lessons/{id}/practice`, `POST .../practice/submit` and the
teacher quiz/practice routes keep their request and response shapes. Differences:
`/courses` now also lists published Course Studio courses to students, and hides
archived modules and lessons (class progress totals ignore them too); `/me/heartbeat` accepts any lesson the student can open; a quiz or practice with no questions, or whose
activity is archived, answers 404 like a missing one. A student attempt also
records `activity_progress` for the matching activity.

## Backend address
http://127.0.0.1:8001 when the backend runs on your own machine.

## Supabase project
Project URL and anon key: provided separately, not committed to Git.

---

## Selling courses

`payment_requests` is the permanent history. `course_access` is the current permission.
Payment is checked by hand: nothing here talks to a payment provider.

### Rules

- A student can open a course when it is free (`price` 0), or given to their class, or they hold
  a `course_access` row that is not revoked and has not expired. This is checked on the server at
  every request, on every lesson route. Anything refused answers 404, the same as a missing lesson.
- Seeing is not opening. A paid course shows up with its price and chapter titles, and `video_url`
  is `null` until it is open. Old progress keeps a course visible, never open.
- `access_days` null means permanent. Time counts from approval. A renewal adds to time that is
  still running, or counts from now. Nothing shortens permanent access.
- When a free course gets a price, students with recorded progress keep it permanently. Courses a
  student only added on their phone leave nothing on the server, so those students see it locked.
- Progress, XP and streaks are never touched by expiry or revocation.

### Course access options (`access_tier`)

Every course is `free`, `paid` or `pro`. Only a paid course has a price (a database rule).

| Option | Opens when |
|---|---|
| `free` | Always |
| any, given to the student's class | Always |
| `paid` | The student holds running `course_access` (bought, kept as an existing learner, or given by the admin). Pro never opens or closes a paid course |
| `pro` | Running `course_access` first, then an active EA Pro membership. Pro ending falls back to the purchase; it never removes it |

Changing to a stricter option (free to paid, free to pro, pro to paid) gives students with recorded
progress a permanent `existing_learner` row. A Pro course cannot be bought on its own (409).

### `GET /courses` and `GET /courses/{id}`

Both add `price`, `currency`, `access_days`, `payment_instructions`, `access_tier`, `purchasable`
(true only for a published paid course, so nobody pays for what would be refused) and, for students:

    "access": { "state": "locked", "expires_at": null, "pending_requests": 1 }

`state` is `free`, `class`, `active`, `pro` (open) or `expired`, `revoked`, `locked`,
`pro_locked` (closed).

### Student routes

| Route | Body | Result |
|---|---|---|
| `POST /courses/{id}/payment-requests` | multipart, field `proof`, a JPG, PNG or WebP of at most 5 MB | 201. 200 if the same image is already waiting. 409 if there is nothing to buy (free, in your class, already permanent, not published). 413, 415. 429 once 5 requests are undecided on this course |
| `GET /me/payment-requests` | | Own requests, newest first: `{id, kind, course_id, plan_id, course_title, status, amount, currency, access_days, review_note, created_at, reviewed_at}`. `kind` is `course` or `plan`; `course_title` holds the plan title for a plan |
| `GET /plans` | | The EA Pro plans on sale: `[{id, title, price, currency, access_days, payment_instructions, is_active, sort_order}]` |
| `POST /plans/{id}/payment-requests` | multipart, field `proof` | Same rules as a course. 404 for a plan off sale. 409 with permanent Pro. 429 once 5 Pro requests are undecided |

The upload carries only the image. The amount, currency and duration are read from the course, and
copied onto the request, so a later price change cannot alter it.

### Teacher routes (owner only; the main admin sees all; 404 when not yours)

| Route | Body | Result |
|---|---|---|
| `PATCH /teacher/courses/{id}` | also `{access_tier?, price?, access_days?, payment_instructions?}` | `access_tier` free or pro sets the price to 0 (duration and instructions stay saved). Paid needs a price, instructions and an owner; Pro needs an owner. A body with only a price works as before: above 0 is paid, 0 is free |
| `GET /teacher/payment-requests` | `?status=&course_id=&teacher_id=&kind=&limit=&offset=` | `{items, total, pending_total}`. Each item has `kind`, the student (`name`, a real `email` only, `username`, `phone`), the `course` or the `plan`, what they saw, `terms_changed`, `image_reused`, `current_access` and `after_approval`. Plan requests are listed, decided and shown only to the main admin |
| `GET /teacher/payment-requests/{id}/proof` | | The image, `no-store` |
| `POST /teacher/payment-requests/{id}/approve` | | Decides and grants together. 409 if already decided |
| `POST /teacher/payment-requests/{id}/reject` | `{note?}` | The note is optional. 409 if already decided |
| `GET /teacher/courses/{id}/access` | | `[{student, state, expires_at, source, granted_at}]` |
| `DELETE /teacher/courses/{id}/access/{student_id}` | | Revokes. The row and all payment history stay |

### Admin routes (main admin only; 404 for everyone else)

The main admin is `role = "teacher"` with `is_admin` on, shown by `GET /auth/me`. It is set by hand
in SQL, and no route can change it. They also edit every course through the teacher routes.

| Route | Body | Result |
|---|---|---|
| `GET /admin/people` | `?role=&q=&limit=&offset=` | `{items, total}`. `q` matches name, email, username or phone (in any written form) |
| `GET /admin/people/{id}` | | The person, `school`, `pro`, their requests, access and owned courses |
| `PATCH /admin/people/{id}` | `{is_active?, role?}` | 409 for yourself, the main admin, or returning a teacher who still owns courses |
| `PUT /admin/courses/{id}/owner` | `{owner_id}` | The new owner must be an active teacher |
| `PUT /admin/courses/{id}/access/{student_id}` | `{access_days}` | Grants or extends with no payment. Null means permanent |
| `PUT /admin/people/{id}/password` | `{password}` | Sets a temporary password (at least 8 characters). Same 409s as `PATCH` |
| `PUT /admin/people/{id}/pro` | `{access_days}` | Gives or extends EA Pro with no payment. Null means permanent. Students only |
| `DELETE /admin/people/{id}/pro` | | Ends Pro now. Never touches `course_access` |
| `GET /admin/plans` | | Every plan, on sale or not |
| `POST /admin/plans` | `{title, price, access_days, payment_instructions}` | 201. Price above 0, a duration in days |
| `PATCH /admin/plans/{id}` | `{title?, price?, access_days?, payment_instructions?, is_active?, sort_order?}` | Sent requests keep the terms the student saw |

### `GET /ranking`

Each row has `pro` (true while that student's Pro runs; the national board may lag by a minute).
`scope=national` takes `period` (`weekly`, `monthly`, `overall`) and returns the top 50 for it plus
the student's own row. Names are first name and last initial, `id` is empty except on the student's
own row, and each row has its real `position`. `scope=class` keeps full names.

---

## Student accounts (phone + username)

Public sign-up stays off in Supabase. The backend creates every student account with the service
key, so every sign-up passes these checks first. Supabase still needs an email per account, so each
student gets a hidden internal address `s.<16 hex>@<STUDENT_EMAIL_DOMAIN>` that is never shown and
never receives mail.

| Route | Body | Result |
|---|---|---|
| `POST /auth/register` | `{username, phone, password, school}` | Public. 201 `{login_email}`: the app signs in with it and the password. 409 if the username or phone is taken. 422 for a bad field. 429 when rate limited. 503 while `STUDENT_EMAIL_DOMAIN` is unset |
| `POST /auth/resolve-login` | `{identifier}` | Public. A phone (any written form) or username in, `{email}` out. An unknown one gets a made-up address of the same shape, so the login answer never shows who has an account. An email passes through |
| `GET /me/profile` | | Student. `{name, username, phone, school, profile_complete}` |
| `PATCH /me/profile` | `{username?, phone?, school?}` | Student. Only the fields sent change. 409 if taken |

`GET /auth/me` adds, for students: `username`, `phone`, `profile_complete` (false asks an older email
account once for these) and `pro: {state, active, expires_at, source}`.

Rules: username 3 to 20 of `a-z 0-9 _`, stored lowercase, a few official-looking names refused;
phone is Ethiopian mobile, stored as `+2519XXXXXXXX` or `+2517XXXXXXXX`; password 8 characters to
72 bytes; school 2 to 120 characters. Staff see phone and username, never an internal address.
