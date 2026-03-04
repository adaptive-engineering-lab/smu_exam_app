# V1 Implementation Plan

This plan translates `docs/V1_SYSTEM_SPEC.md` into concrete execution steps for engineering.

## 1) Delivery Phases

## Phase 0 — Repo Bootstrap (Day 1–2)

**Backend (FastAPI)**
- Initialize FastAPI project with module layout from spec.
- Configure environment loading (`.env`) and app settings.
- Add PostgreSQL connection + migrations (Alembic).
- Add JWT auth utilities and password hashing.

**Frontend (React + Vite)**
- Initialize project structure and routing.
- Add API client wrapper with JWT handling.
- Add auth pages (login/register) + protected route gate.

**Definition of done**
- App boots locally with backend/frontend running.
- Database migration system is operational.
- Basic `/auth/register`, `/auth/login`, `/auth/me` works end-to-end.

---

## Phase 1 — Core Academic Domain (Day 3–5)

**Backend**
- Implement models/migrations for:
  - `users`, `schools`, `degrees`, `courses`
  - `degree_courses`, `course_students`, `course_lecturers`
- Build endpoints:
  - `POST/GET /schools`
  - `POST/GET /degrees`
  - `POST/GET /courses`
  - `POST /courses/{id}/students`
  - `POST /courses/{id}/lecturers`
- Add role-based checks:
  - admin/super_admin for academic management.

**Frontend**
- Admin views for schools/degrees/courses CRUD (create + list for V1).
- Enrollment screens for students/lecturers per course.

**Definition of done**
- Academic entities can be created and queried.
- Enrollment data persists and is visible.

---

## Phase 2 — Exams & Questions (Day 6–8)

**Backend**
- Implement models/migrations:
  - `exams`, `exam_courses`, `questions`, `question_options`
- Build endpoints:
  - `POST /exams`
  - `GET /exams`
  - `GET /exams/{id}`
  - `POST /exams/{id}/questions`
- Add lecturer authorization by course assignment.

**Frontend**
- Lecturer exam creation page.
- Question builder supporting `MCQ`, `TRUE_FALSE`, `SHORT_ANSWER`.
- Exam listing/detail pages.

**Definition of done**
- Lecturers can create and attach exams/questions.
- Students can view only exams available to enrolled courses.

---

## Phase 3 — Attempt Lifecycle + Timer + Randomization (Day 9–12)

**Backend**
- Implement models/migrations:
  - `exam_attempts`, `attempt_questions`, `answers`
- Build endpoints:
  - `POST /exams/{id}/attempt`
  - `POST /attempts/{id}/answers`
- Attempt start behavior:
  - Validate exam window + enrollment.
  - Create attempt once per student per exam.
  - Persist randomized question order in `attempt_questions`.
- Save behavior:
  - Upsert answers by `(attempt_id, question_id)`.
  - Enforce `in_progress` only.

**Frontend**
- Build `ExamPage` with:
  - Timer, navigator, renderer.
- Add autosave every 3–5 seconds.

**Definition of done**
- Student can start exam, answer questions, and see persistent randomized order.
- Refreshing browser preserves progress and order.

---

## Phase 4 — Offline Queue + Sync Resolution (Day 13–14)

**Backend**
- Support timestamp conflict resolution in `/attempts/{id}/answers`.
- Return server timestamps for client reconciliation.

**Frontend**
- Implement LocalStorage-backed unsynced queue.
- Replay queue on reconnect.
- Conflict policy: latest timestamp wins.

**Definition of done**
- Offline answer entry is retained and syncs reliably on reconnect.
- No data loss in basic disconnect/reconnect test flow.

---

## Phase 5 — Integrity Logs + Submission PDF (Day 15–17)

**Backend**
- Implement models/migrations:
  - `proctor_logs`, `submissions`
- Build endpoints:
  - `POST /attempts/{id}/proctor-events`
  - `POST /attempts/{id}/submit`
- Submission flow:
  - Transactional status lock (`submitted`).
  - Generate PDF payload.
  - Upload to Azure Blob.
  - Persist `submissions` row.

**Frontend**
- Add integrity monitor listeners:
  - `visibilitychange`, `blur`, `focus`, `fullscreenchange`, `offline`, `online`.
- Add final submission UX + confirmation screen.

**Definition of done**
- Integrity events stored and queryable.
- Submission creates PDF URL and finalizes attempt.

---

## Phase 6 — Hardening & Go-Live Readiness (Day 18–20)

- Add API validation/error model standardization.
- Add structured logging + request IDs.
- Add smoke tests for critical user flows.
- Load check for 500 concurrent students baseline.
- Deployment setup (Azure App Service + PostgreSQL + Blob + Static Web Apps).

**Definition of done**
- Stable staging environment.
- Verified critical flows with test checklist.

---

## 2) Work Breakdown by Track

## Backend Track
- [ ] App skeleton + settings + DB session lifecycle.
- [ ] Auth (register/login/me, JWT, hash).
- [ ] Academic entities + enrollment endpoints.
- [ ] Exams/questions endpoints.
- [ ] Attempt start + randomized ordering.
- [ ] Autosave upsert + timestamp conflict handling.
- [ ] Proctor event ingestion.
- [ ] Submit + PDF + Blob upload.
- [ ] Authorization coverage and policy tests.

## Frontend Track
- [ ] Auth UI and token/session handling.
- [ ] Admin academic management pages.
- [ ] Lecturer exam builder and questions editor.
- [ ] Student exam listing and exam player.
- [ ] Autosave hooks + offline queue + replay.
- [ ] Integrity monitoring hook.
- [ ] Final submission UX + PDF receipt display.

## DevOps/Infra Track
- [ ] Environment templates and secrets management.
- [ ] CI checks (lint/test/build).
- [ ] Staging deployment pipeline.
- [ ] Monitoring/log aggregation baseline.

---

## 3) Suggested API/Migration Order

1. Users/auth tables and endpoints.
2. School/degree/course tables + enrollment joins.
3. Exam/question tables.
4. Attempt/answer tables.
5. Proctor/submission tables.

This sequencing minimizes blockers for parallel backend/frontend implementation.

---

## 4) Acceptance Checklist (V1)

- [ ] Student can authenticate and access assigned exams only.
- [ ] Exam start enforces enrollment and exam window.
- [ ] Question order is randomized once and remains stable for the attempt.
- [ ] Autosave persists answers while online.
- [ ] Offline answers replay successfully on reconnect.
- [ ] Tab/window/network integrity events are logged.
- [ ] Final submit locks attempt and creates blob-backed PDF reference.
- [ ] Access control prevents cross-student attempt access.

---

## 5) Immediate Next Sprint (Sprint 1)

**Goal:** reach functional vertical slice from auth → start exam → save answer.

**Sprint 1 scope**
- Backend phases 0 + 1 + partial 2/3 (auth, academics, exam create, attempt start, basic answer save).
- Frontend auth + simple exam player shell with one question at a time.

**Sprint 1 exit criteria**
- Demo: lecturer creates exam, student starts exam, student saves answers.
