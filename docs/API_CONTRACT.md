# EA API Contract v0.1

This file is the source of truth. If the backend and this file disagree,
the file wins until both developers agree to change it.

## Roles
Exact lowercase strings: `student` and `teacher`.

## Auth
Every request except login sends this header:

    Authorization: Bearer <access_token>

Token lifetime is 60 minutes. When it expires the API returns 401 and the
app sends the user back to the login screen. No refresh tokens in v0.1.

## Errors
The body is always `{"detail": "<message>"}` and `detail` is always a string.

- 401: bad login, or missing / bad / expired token
- 403: logged in but wrong role
- 404: not found
- 422: invalid input, for example `{"detail": "Invalid or missing field: email"}`

## POST /auth/login
Request:

    { "email": "sara@ea.test", "password": "ea-dev-123" }

200:

    {
      "access_token": "...",
      "token_type": "bearer",
      "user": { "id": 2, "name": "Sara", "email": "sara@ea.test", "role": "student" }
    }

401: `{"detail": "Invalid email or password"}`

## GET /auth/me
Any logged-in user.

200:

    { "id": 2, "name": "Sara", "email": "sara@ea.test", "role": "student" }

401: `{"detail": "Invalid or expired token"}`

## GET /students
Teacher only.

200:

    [
      {
        "id": 2,
        "name": "Sara",
        "email": "sara@ea.test",
        "role": "student",
        "is_active": true,
        "created_at": "2026-09-19T10:00:00Z"
      }
    ]

403: `{"detail": "Teachers only"}`

## GET /students/{id}
Teacher only.

- 200: one student object, same shape as above
- 404: `{"detail": "Student not found"}`
- 403: `{"detail": "Teachers only"}`

## Seed accounts (dev only, password for all: ea-dev-123)
- teacher@ea.test (id 1, teacher)
- sara@ea.test (id 2), daniel@ea.test (id 3), hana@ea.test (id 4) (students)

## Backend address
http://127.0.0.1:8001 when the backend runs on your own machine.