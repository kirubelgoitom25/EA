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

## Backend address
http://127.0.0.1:8001 when the backend runs on your own machine.

## Supabase project
Project URL and anon key: provided separately, not committed to Git.