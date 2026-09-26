# Backend Spec — Supabase for the EA Student App

This document describes exactly what the backend needs to provide so the
existing frontend can be connected without any UI changes. The frontend
already talks to a single file, `services/api.js`, which currently wraps
mock data — once the tables and auth below exist, that file's function
*bodies* get swapped for real Supabase calls, but the function names and
return shapes should stay the same.

## 1. Auth

- Use Supabase Auth with email/password to start (magic link can come later).
- On signup, a matching row should be created in `profiles` (a Postgres
  trigger on `auth.users` insert is the usual pattern for this).
- The frontend expects `loginUser(email, password)` to resolve to:
  ```json
  { "id": "...", "name": "...", "email": "...", "role": "student" }
  ```

## 2. Database schema

### `profiles`
One row per user, linked to `auth.users.id`.

| column      | type      | notes                              |
|-------------|-----------|-------------------------------------|
| id          | uuid (PK) | matches `auth.users.id`             |
| name        | text      |                                      |
| email       | text      |                                      |
| role        | text      | e.g. `"student"`                    |
| streak      | int       | current day streak                  |
| created_at  | timestamp | default `now()`                     |

Total XP, weekly XP, and monthly XP should **not** be stored as columns
here — see `xp_events` below. Storing a running total invites it to drift
out of sync with reality; summing events on read is more reliable and is
what lets "weekly" and "monthly" views work correctly.

### `courses`
| column       | type      |
|--------------|-----------|
| id           | uuid (PK) |
| title        | text      |
| description  | text      |

### `modules`
| column     | type                        |
|------------|------------------------------|
| id         | uuid (PK)                    |
| course_id  | uuid (FK → courses.id)       |
| title      | text                         |
| order      | int                          |

### `lessons`
| column      | type                        |
|-------------|------------------------------|
| id          | uuid (PK)                    |
| module_id   | uuid (FK → modules.id)       |
| title       | text                         |
| duration    | text (e.g. `"4 min"`)        |
| video_url   | text                         |
| order       | int                          |

Note: lesson completion is **per student**, so it does not live on this
table — see `lesson_progress` below. (The current mock data has a bug
where a `completed` flag lives directly on the lesson object, which only
works for a single hardcoded user — don't replicate that in the schema.)

### `lesson_progress`
One row per (student, lesson) once they've completed it.

| column       | type                        |
|--------------|------------------------------|
| student_id   | uuid (FK → profiles.id)      |
| lesson_id    | uuid (FK → lessons.id)       |
| completed_at | timestamp                    |

Primary key: `(student_id, lesson_id)`.

### `quizzes` / `quiz_questions`
| `quizzes` column | type                    |
|-------------------|--------------------------|
| id                 | uuid (PK)                |
| lesson_id          | uuid (FK → lessons.id)   |

| `quiz_questions` column | type                      |
|--------------------------|----------------------------|
| id                        | uuid (PK)                  |
| quiz_id                   | uuid (FK → quizzes.id)     |
| question                  | text                       |
| options                   | text[] (array of choices)  |
| correct_answer            | int (index into `options`)|
| order                     | int                        |

### `practices` / `practice_activities`
| `practices` column | type                    |
|----------------------|--------------------------|
| id                    | uuid (PK)                |
| lesson_id             | uuid (FK → lessons.id)   |
| title                 | text                     |

| `practice_activities` column | type                                  |
|-------------------------------|-----------------------------------------|
| id                              | uuid (PK)                              |
| practice_id                     | uuid (FK → practices.id)               |
| type                            | text — `"fill"` or `"choose"`          |
| question                        | text                                    |
| sentence                        | text, nullable (fill-in-blank prompt)  |
| options                         | text[], nullable (choose-type only)    |
| answer                          | text — exact answer, or option index as text for `"choose"` |
| order                           | int                                      |

### `quiz_attempts` / `practice_attempts`
Every attempt, not just the latest — needed for the diminishing-XP retry
logic (1st attempt = 10 XP/correct, 2nd = 5, 3rd = 2.5, 4th+ = 1).

| column       | type                        |
|--------------|------------------------------|
| id           | uuid (PK)                    |
| student_id   | uuid (FK → profiles.id)      |
| lesson_id    | uuid (FK → lessons.id)       |
| score        | int                           |
| xp_earned    | numeric                      |
| created_at   | timestamp                    |

The attempt **number** for a given student+lesson is just
`count(*) + 1` from this table — no separate counter needed.

### `xp_events`
The source of truth for all XP. Every award (quiz, practice, anything
added later) inserts a row here instead of incrementing a total.

| column       | type                              |
|--------------|-------------------------------------|
| id           | uuid (PK)                           |
| student_id   | uuid (FK → profiles.id)             |
| amount       | numeric                             |
| source       | text — `"quiz"` / `"practice"` / …  |
| created_at   | timestamp                           |

- **Total XP** = `sum(amount) where student_id = X`
- **Weekly XP** = same, filtered to `created_at >= now() - interval '7 days'`
- **Monthly XP** = same, filtered to `created_at >= now() - interval '30 days'`

This is what makes the Ranking screen's Weekly/Monthly/Overall tabs
actually mean something, instead of showing the same total for every tab
(which is what the mock data does today).

## 3. Row Level Security

- `profiles`: a user can `select`/`update` only their own row
  (`auth.uid() = id`). Consider a public read-only *view* exposing just
  `id, name` for leaderboard display — you don't want every student able
  to read every other student's email.
- `courses` / `modules` / `lessons` / `quizzes` / `quiz_questions` /
  `practices` / `practice_activities`: public read for any authenticated
  user, no write access from the client.
- `lesson_progress` / `quiz_attempts` / `practice_attempts` / `xp_events`:
  a user can `insert`/`select` only rows where `student_id = auth.uid()`.
  No `update`/`delete` from the client — these are an append-only log.

## 4. Leaderboard query

Needs a view or RPC function that, given a period (`week` / `month` /
`all`), returns `student_id, name, xp` sorted descending. Something like:

```sql
create or replace function get_leaderboard(period text)
returns table(student_id uuid, name text, xp numeric)
language sql stable as $$
  select p.id, p.name, coalesce(sum(e.amount), 0) as xp
  from profiles p
  left join xp_events e on e.student_id = p.id
    and (
      period = 'all'
      or (period = 'week' and e.created_at >= now() - interval '7 days')
      or (period = 'month' and e.created_at >= now() - interval '30 days')
    )
  group by p.id, p.name
  order by xp desc;
$$;
```

## 5. Streak

Heads up: the frontend currently shows a "this week" streak calendar
(7 day-circles), but it's only an approximation — it just fills the most
recent N circles based on a single `streak` count, because there's no
real daily-activity log yet. If you want that calendar to be accurate,
add a lightweight `daily_activity` table (`student_id`, `activity_date`)
written to once per day the student does anything, and compute `streak`
as the number of consecutive days up to today. Not required for MVP —
flagging so it isn't forgotten.

## 6. Suggested build order

1. Auth + `profiles` (with the signup trigger)
2. `courses` / `modules` / `lessons` (read-only content)
3. `quizzes` / `quiz_questions`, `practices` / `practice_activities`
4. `xp_events`, `quiz_attempts`, `practice_attempts`, `lesson_progress`
5. RLS policies on everything above
6. The `get_leaderboard` RPC
7. (Optional, later) `daily_activity` for a real streak calendar
8. (Optional, later) Realtime subscription on `xp_events` so the
   leaderboard updates live

## 7. What the frontend already expects (`services/api.js`)

These function signatures are already in place on the frontend and
resolve from mock data today. Match these shapes and the swap is a
same-file, same-signature change:

- `loginUser(email, password)` → `{ id, name, email, role }`
- `fetchStudent()` → `{ id, name, email, role, xp, streak }`
- `fetchCourses()` → array of courses with nested `modules[].lessons[]`
- `fetchQuizByLessonId(lessonId)` → `{ lessonId, questions: [...] }`
- `fetchPracticeByLessonId(lessonId)` → `{ lessonId, activities: [...] }`
- `fetchRanking(period)` → array of `{ id, name, xp }`
- `addXp(studentId, amount, source)` → insert into `xp_events`
- `markLessonCompleted(lessonId)` → insert into `lesson_progress`
- `recordQuizAttempt(studentId, lessonId, score, xpEarned)` → insert into `quiz_attempts`
- `recordPracticeAttempt(studentId, lessonId, score, xpEarned)` → insert into `practice_attempts`
