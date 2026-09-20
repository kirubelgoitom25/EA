# EA

Mini-MVP v0.1: a student logs into the mobile app, a teacher logs into
the web dashboard and sees the students.

## Folders
backend/       Python + FastAPI + PostgreSQL (API)
student-app/ React Native + Expo + JavaScript
teacher-web/ React + JavaScript

## Rules
Auth: JWT, sent as "Authorization: Bearer <token>"
Roles: "student" and "teacher" (exact lowercase strings)
Errors: always {"detail": "<string>"}
API: REST, the contract is the source of truth
Backend port: 8001
Branches: dev-1/<name> for backend, dev-2/<name> for frontend
Commits: feat: / fix: / docs: / refactor:
Never commit .env, only .env.example
Nobody pushes directly to main, use a pull request

## Running the backend (Windows PowerShell)
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env    (then fill in real values)
uvicorn app.main:app --reload --port 8001
API docs: http://127.0.0.1:8001/docs
