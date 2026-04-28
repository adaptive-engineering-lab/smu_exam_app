# SMU Exam App

Online examination management platform: a React/Vite frontend on Netlify, with Supabase providing Postgres, Auth, Storage, and Edge Functions. Admins manage the academic hierarchy and users, lecturers build and grade exams, and students sit timed exams in a browser-based player with autosave and reconnect support.

## Stack

- **Frontend** — React 18, Vite 5, TypeScript, Tailwind v4, React Router 6, `@supabase/supabase-js`, deployed to **Netlify**
- **Database** — Supabase Postgres with Row-Level Security
- **Auth** — Supabase Auth (JWT, HS256)
- **Storage** — Supabase Storage (`submissions` bucket, private; downloads via 1-hour signed URLs)
- **Server logic** — Supabase Postgres functions (`begin_or_resume_attempt`, `create_question_with_options`, etc.) for transactional operations + Supabase Edge Functions (Deno + TypeScript) for PDF generation, CSV import, admin user management, and signed-URL minting

## Repository layout

```text
frontend/                    Vite SPA
  src/api/                   Thin wrappers around supabase-js / functions.invoke
  src/pages/                 LoginPage, Dashboard, admin/, lecturer/, student/
  src/components/            ProtectedRoute, Layout, ui/
  src/hooks/                 useExamTimer, useAutosave
  netlify.toml               SPA fallback + security headers + asset caching
supabase/
  config.toml                Supabase CLI project config
  migrations/                SQL migrations
    0001_initial_schema.sql  10 tables + submissions storage bucket
    0002_rls_policies.sql    RLS deny-by-default + role-aware policies + guard trigger
    0003_functions.sql       PG functions: begin_or_resume_attempt, log_integrity_event,
                             create_question_with_options, update_question_with_options
  functions/                 Edge Functions (Deno)
    _shared/                 cors.ts, auth.ts (userClient/adminClient/getCallerRole)
    submit-attempt/          Mark attempt submitted, render PDF (pdf-lib), upload, persist path
    import-questions-csv/    Parse CSV blob, call create_question_with_options per row
    admin-user-management/   Action-discriminated register/update/set_password/delete
    get-attempt-pdf/         Mint a 1-hour signed URL for the attempt PDF
docs/                        V1 system spec and implementation plan
.github/workflows/deploy.yml Pushes migrations + Edge Functions to the linked Supabase project
```

## Domain model

`School → Degree → Course → Exam → Question → Option`

- **Users** — roles: `super_admin`, `admin`, `lecturer`, `student`. `public.users.id` is the Supabase Auth UUID and FKs back to `auth.users(id)` on delete cascade.
- **Enrollment** — links students to courses.
- **ExamAttempt** — one per `(exam_id, student_id)`; stores `tab_switches`, `disconnect_events`, `pdf_path`, plus optional `question_order` / `option_orders` JSON for shuffle.
- **Answer** — upserted per autosave with a unique `(attempt_id, question_id)` constraint.

See [docs/V1_SYSTEM_SPEC.md](docs/V1_SYSTEM_SPEC.md) for the schema and flow diagrams (FastAPI references in that doc are historical).

## How it works

### Authentication

- Frontend calls `supabase.auth.signInWithPassword`; the session is cached by `@supabase/supabase-js` in localStorage and attached as `Authorization: Bearer <jwt>` on every PostgREST and edge-function call.
- `public.users.role` is the source of truth for authorisation. Edge functions look it up via the user-scoped client; RLS policies use `is_admin()` / `auth_role()` helpers that read from the same table.
- User provisioning, role changes, and password resets flow through the `admin-user-management` edge function, which uses the service-role client to keep `auth.users` and `public.users` in sync.

### Row-Level Security

Every app table has RLS enabled with deny-by-default. Highlights:

- Lecturers see only their own exams (via `created_by = auth.uid()`); admins see all.
- Students see published exams in courses they're enrolled in, and only when the exam is in its availability window.
- Question and option visibility for students is gated on the student having an active attempt for the parent exam — preventing pre-reading.
- `is_correct` on options is masked client-side for student callers (RLS cannot mask columns; the api layer drops the field).
- A `BEFORE UPDATE` trigger on `exam_attempts` rejects any user-role update that would flip `is_submitted`, `submitted_at`, `pdf_path`, or shuffle orders. Only the `submit-attempt` edge function (under service role) can write those.

### Exam runtime

- **Begin / resume** — `supabase.rpc('begin_or_resume_attempt', { p_exam_id })`. Validates publish state and window, computes shuffle orders if requested, idempotently returns an existing non-submitted attempt.
- **Timer** — `useExamTimer` persists `remainingSeconds` to localStorage so a refresh resumes the same countdown.
- **Autosave** — `useAutosave` flushes dirty answers via `supabase.from('answers').upsert(..., { onConflict: 'attempt_id,question_id' })` every 4 s; RLS gates each upsert.
- **Submit** — `supabase.functions.invoke('submit-attempt', { body: { attempt_id } })`. Marks submitted, gathers exam/answers/student/lecturer, renders a PDF with **pdf-lib**, uploads to the `submissions` bucket as `<attempt_id>.pdf`, and writes the relative key into `pdf_path`.
- **Integrity events** — `supabase.rpc('log_integrity_event', { p_attempt_id, p_event_type })` atomically increments `tab_switches` or `disconnect_events`.

### Frontend routes

- `/login`, `/forgot-password`, `/reset-password`, `/dashboard`, `/settings`
- `/admin/{schools,degrees,courses,users}`
- `/lecturer/exams`, `/lecturer/exams/:examId/build`, `/lecturer/exams/:examId/submissions`
- `/student/dashboard`, `/student/attempt/:attemptId`

## Getting started

### Prerequisites

- Node 20+
- A Supabase project (Postgres + Auth + Storage)
- The Supabase CLI (`npm i -g supabase`) for local dev and deploys

### 1. Clone and install

```bash
git clone <repo-url> smu_exam_app
cd smu_exam_app/frontend
npm install
```

### 2. Configure environment

`frontend/.env`

```dotenv
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### 3. Run the SPA

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. Sign in with a user provisioned through the admin flow, or seed one in the Supabase dashboard and insert the matching row in `public.users`.

### 4. Local Supabase (optional)

```bash
supabase start                # boots local Postgres + Auth + Storage + Studio at :54321
supabase db reset             # applies all migrations in supabase/migrations/
supabase functions serve      # serves Edge Functions locally at :54321/functions/v1/*
```

Point `VITE_SUPABASE_URL` at `http://localhost:54321` and use the anon key printed by `supabase start`.

## Deployment

Three pieces:

- **Frontend → Netlify.** Connect the GitHub repo in the Netlify UI; `frontend/netlify.toml` configures the build, SPA fallback, and security headers. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify's environment.
- **Migrations + Edge Functions → Supabase.** [.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs on push to `main` and calls `supabase db push` followed by `supabase functions deploy` for each function. Required secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
- **Supabase Auth redirect URL.** Add the Netlify domain to the project's allowed redirect URLs in the Supabase dashboard so the password-reset flow lands back on `/reset-password`.

## Further reading

- [docs/V1_SYSTEM_SPEC.md](docs/V1_SYSTEM_SPEC.md) — schema and runtime flows (notes that pre-date the Supabase migration are still useful for the data model)
- [supabase/migrations/](supabase/migrations/) — SQL is the authoritative reference for the schema, RLS, and Postgres functions
- [supabase/functions/_shared/auth.ts](supabase/functions/_shared/auth.ts) — pattern for any new edge function
