# Online Examination Management Platform — V1 System Specification

## 1) Scope and Goals

This V1 specification formalizes the data model, API contracts, and core runtime flows for an online examination platform.

**Primary goals (V1):**
- Role-based academic management (super admin/admin/lecturer/student).
- Exam creation, assignment to courses, and secure student attempts.
- Autosave + reconnect synchronization for unstable networks.
- Integrity event logging during exam sessions.
- Final PDF archival to Azure Blob Storage.

**Out of scope (V1):**
- AI-based cheating detection.
- Advanced analytics dashboards.
- Large reusable question banks.

---

## 2) Architecture

```text
React (Vite SPA)
  ↕ HTTPS + JWT
FastAPI backend
  ↕ SQL
PostgreSQL

FastAPI ↔ Azure Blob Storage (PDF submissions)

Browser LocalStorage ↔ Sync API (offline answer cache + replay)
```

### Service responsibilities
- **Frontend**: auth UI, exam player, timer, autosave, offline queue, integrity listeners.
- **Backend**: authorization, exam lifecycle, attempt locking, PDF generation trigger, sync conflict resolution.
- **PostgreSQL**: source of truth for users/academics/exams/attempts/answers/proctor logs.
- **Blob storage**: immutable PDF artifacts.

---

## 3) Domain Model and Relational Schema

> Conventions:
> - IDs are UUID (`uuid`) unless stated otherwise.
> - `created_at`, `updated_at` are `timestamptz` in UTC.
> - Soft delete is not included in V1; hard delete only for admin operations.

### 3.1 Users

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin','admin','lecturer','student')),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.2 Academic Structure

```sql
CREATE TABLE schools (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE degrees (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE courses (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE degree_courses (
  degree_id uuid NOT NULL REFERENCES degrees(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (degree_id, course_id)
);

CREATE TABLE course_lecturers (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lecturer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, lecturer_id)
);

CREATE TABLE course_students (
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, student_id)
);
```

### 3.3 Exams

```sql
CREATE TABLE exams (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  start_window timestamptz NOT NULL,
  end_window timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_window > start_window)
);

CREATE TABLE exam_courses (
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, course_id)
);
```

### 3.4 Questions

```sql
CREATE TABLE questions (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('MCQ','TRUE_FALSE','SHORT_ANSWER')),
  order_index int NOT NULL,
  UNIQUE (exam_id, order_index)
);

CREATE TABLE question_options (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false
);
```

### 3.5 Attempts + randomized order

```sql
CREATE TABLE exam_attempts (
  id uuid PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  status text NOT NULL CHECK (status IN ('in_progress','submitted','expired')),
  score numeric(6,2),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE attempt_questions (
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  PRIMARY KEY (attempt_id, question_id),
  UNIQUE (attempt_id, order_index)
);
```

### 3.6 Answers

```sql
CREATE TABLE answers (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text text,
  selected_option_id uuid REFERENCES question_options(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
```

### 3.7 Integrity logs

```sql
CREATE TABLE proctor_logs (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'TAB_SWITCH','WINDOW_BLUR','DISCONNECT','RECONNECT','FULLSCREEN_EXIT'
  )),
  timestamp timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_proctor_logs_attempt_time ON proctor_logs (attempt_id, timestamp);
```

### 3.8 Submission artifacts

```sql
CREATE TABLE submissions (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE REFERENCES exam_attempts(id) ON DELETE CASCADE,
  pdf_url text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 4) API Contract (FastAPI)

### 4.1 Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

JWT bearer token required for all protected routes.

### 4.2 Academic structure

- `POST /schools`, `GET /schools`
- `POST /degrees`, `GET /degrees`
- `POST /courses`, `GET /courses`
- `POST /courses/{id}/students`
- `POST /courses/{id}/lecturers`

### 4.3 Exams

- `POST /exams`
- `GET /exams`
- `GET /exams/{id}`
- `POST /exams/{id}/questions`

### 4.4 Attempts & exam player

- `POST /exams/{id}/attempt`
- `POST /attempts/{id}/answers`
- `POST /attempts/{id}/proctor-events`
- `POST /attempts/{id}/submit`

---

## 5) Request/Response Shapes (V1)

## 5.1 Start attempt

`POST /exams/{id}/attempt`

Rules:
- Student must be enrolled in at least one course attached to exam.
- Current time must be within exam window.
- If an attempt exists:
  - return existing active attempt data (idempotent start), unless submitted/expired.

Response:

```json
{
  "attempt_id": "uuid",
  "start_time": "2026-01-10T09:00:00Z",
  "duration_minutes": 120,
  "questions": [
    {
      "question_id": "uuid",
      "order_index": 1,
      "question_text": "...",
      "question_type": "MCQ",
      "options": [{"id": "uuid", "option_text": "..."}]
    }
  ],
  "server_time": "2026-01-10T09:00:05Z"
}
```

## 5.2 Autosave answers

`POST /attempts/{id}/answers`

```json
{
  "answers": [
    {
      "question_id": "uuid",
      "answer_text": "short answer text",
      "selected_option_id": null,
      "client_updated_at": "2026-01-10T09:05:00Z"
    }
  ]
}
```

Behavior:
- Upsert by `(attempt_id, question_id)`.
- Conflict policy: **latest timestamp wins** (`max(client_updated_at, server_updated_at)` semantics with server validation).
- Reject writes for non-`in_progress` attempts.

## 5.3 Proctor events

`POST /attempts/{id}/proctor-events`

```json
{
  "events": [
    {
      "event_type": "WINDOW_BLUR",
      "timestamp": "2026-01-10T09:06:10Z",
      "metadata": {"duration": 12, "browser": "Chrome"}
    }
  ]
}
```

## 5.4 Submit attempt

`POST /attempts/{id}/submit`

Behavior:
1. Lock attempt status to `submitted` with transaction.
2. Save any final payload answers.
3. Generate PDF payload from attempt + answers + logs.
4. Upload PDF to Blob Storage.
5. Persist `submissions` record.

Response:

```json
{
  "attempt_id": "uuid",
  "status": "submitted",
  "submitted_at": "2026-01-10T11:00:00Z",
  "pdf_url": "https://...blob.../submission.pdf"
}
```

---

## 6) Authorization Matrix (minimum)

- **super_admin/admin**: manage schools/degrees/courses and enrollments.
- **lecturer**: create exams, add questions, view attempts for assigned courses.
- **student**: list accessible exams, start attempt, save answers, submit own attempt.

Server must enforce:
- ownership/access checks by course linkage.
- attempt can only be read/written by owning student (except lecturer/admin review endpoints).

---

## 7) Core Runtime Flows

## 7.1 Begin exam

1. Client calls `POST /exams/{id}/attempt`.
2. Server validates enrollment and window.
3. Server creates `exam_attempts` row + shuffled `attempt_questions` if first time.
4. Client receives fixed question order for entire attempt.

## 7.2 Timer behavior

- Timer is server-authoritative using `start_time` + `duration_minutes`.
- Remaining time:

```text
remaining = duration_minutes*60 - (server_now - start_time)
```

- If remaining <= 0 and not submitted, backend marks attempt `expired` and rejects further saves/submission (or accepts submit as expired policy, if configured).

## 7.3 Offline autosave + replay

Client behavior:
1. On each answer change, update in-memory state and LocalStorage queue.
2. Every 3–5 seconds, if online, flush queue via `/attempts/{id}/answers`.
3. On reconnect, replay unsynced operations sorted by `client_updated_at`.
4. Server resolves per-question conflict by latest timestamp.

## 7.4 Integrity monitoring

Frontend listens for:
- `visibilitychange`
- `blur`
- `focus`
- `fullscreenchange`
- `offline`
- `online`

It batches and sends events via `/proctor-events`.

## 7.5 Final submission

1. Client calls submit.
2. Server transactionally locks attempt, finalizes status.
3. Async-safe path ensures exactly one `submissions` row.
4. Client gets final PDF URL.

---

## 8) Non-Functional Requirements (V1)

- **Scale target**: 500 concurrent students.
- **Availability**: backend 2 instances minimum.
- **Latency target**:
  - answer autosave p95 < 500ms (regional deployment).
- **Data durability**:
  - DB backups + Blob replication defaults.

---

## 9) Deployment Baseline (Azure)

- Frontend: Azure Static Web Apps
- Backend: Azure App Service (2 instances)
- Database: Azure PostgreSQL Flexible Server
- Storage: Azure Blob Storage

---

## 10) Security Baseline (V1)

- Password hashing (Argon2 or bcrypt).
- JWT access tokens; short-lived access + refresh strategy recommended.
- HTTPS-only transport.
- Row-level ownership checks on attempts/answers.
- Attempt locking after submission.
- Enforce exam start/end window server-side.
- Auditability with proctor logs.

---

## 11) Implementation Notes for Development Kickoff

Suggested backend module layout:

```text
app/
  api/
    auth.py
    schools.py
    degrees.py
    courses.py
    exams.py
    attempts.py
  models/
  schemas/
  services/
    attempt_service.py
    sync_service.py
    proctor_service.py
    pdf_service.py
    storage_service.py
  core/
    security.py
    config.py
    db.py
```

Suggested frontend exam modules:

```text
src/features/exam/
  ExamPage.tsx
  Timer.tsx
  QuestionNavigator.tsx
  QuestionRenderer.tsx
  useAutosave.ts
  useIntegrityMonitor.ts
  offlineQueue.ts
```

This spec is intended to be implementation-ready for a V1 milestone.
