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
| `DELETE /teacher/courses/{id}/classes/{class_id}` | | Takes it back. Students keep their progress; a published course stays open to them anyway |
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