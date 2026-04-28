-- Initial schema for the SMU exam app.
-- Consolidates the six Alembic revisions in backend/migrations/versions/ into
-- a single SQL file managed by the Supabase CLI. The current Alembic-managed
-- database in production is the source of truth; this file expresses the same
-- shape so a fresh `supabase db reset` produces an equivalent schema.

create extension if not exists "uuid-ossp";

-- ─── users ────────────────────────────────────────────────────────────────
-- users.id is the Supabase Auth user UUID. Inserts happen via the
-- admin-user-management edge function (service-role) so the row is kept in
-- sync with auth.users.

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  name          text,
  password_hash text,
  role          text not null check (role in ('super_admin','admin','lecturer','student')),
  created_at    timestamptz not null default now()
);

create index users_role_idx on public.users(role);

-- ─── academic structure ──────────────────────────────────────────────────

create table public.schools (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table public.degrees (
  id         uuid primary key default uuid_generate_v4(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index degrees_school_idx on public.degrees(school_id);

create table public.courses (
  id          uuid primary key default uuid_generate_v4(),
  degree_id   uuid not null references public.degrees(id) on delete cascade,
  lecturer_id uuid references public.users(id) on delete set null,
  name        text not null,
  code        text not null unique,
  created_at  timestamptz not null default now()
);

create index courses_degree_idx on public.courses(degree_id);
create index courses_lecturer_idx on public.courses(lecturer_id);

create table public.enrollments (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references public.users(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (student_id, course_id)
);

create index enrollments_course_idx on public.enrollments(course_id);

-- ─── exams + questions + options ─────────────────────────────────────────

create table public.exams (
  id                uuid primary key default uuid_generate_v4(),
  course_id         uuid not null references public.courses(id) on delete cascade,
  created_by        uuid not null references public.users(id),
  title             text not null,
  description       text,
  duration_minutes  integer not null check (duration_minutes > 0),
  available_from    timestamptz,
  available_until   timestamptz,
  is_published      boolean not null default false,
  academic_year     text,
  shuffle_questions boolean not null default false,
  shuffle_options   boolean not null default false,
  created_at        timestamptz not null default now()
);

create index exams_course_idx on public.exams(course_id);
create index exams_created_by_idx on public.exams(created_by);

create table public.questions (
  id            uuid primary key default uuid_generate_v4(),
  exam_id       uuid not null references public.exams(id) on delete cascade,
  text          text not null,
  question_type text not null check (question_type in ('mcq','true_false','short_answer')),
  order_index   integer not null default 0,
  points        integer not null default 1 check (points >= 0),
  created_at    timestamptz not null default now()
);

create index questions_exam_idx on public.questions(exam_id);

create table public.options (
  id          uuid primary key default uuid_generate_v4(),
  question_id uuid not null references public.questions(id) on delete cascade,
  text        text not null,
  is_correct  boolean not null default false,
  order_index integer not null default 0
);

create index options_question_idx on public.options(question_id);

-- ─── attempts + answers ──────────────────────────────────────────────────

create table public.exam_attempts (
  id                uuid primary key default uuid_generate_v4(),
  exam_id           uuid not null references public.exams(id),
  student_id        uuid not null references public.users(id),
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  is_submitted      boolean not null default false,
  tab_switches      integer not null default 0,
  disconnect_events integer not null default 0,
  pdf_path          text,
  -- JSON-encoded list[uuid] of question IDs in display order (set when shuffle_questions is on).
  question_order    text,
  -- JSON-encoded dict[question_id, list[option_id]] (set when shuffle_options is on).
  option_orders     text,
  unique (exam_id, student_id)
);

create index exam_attempts_student_idx on public.exam_attempts(student_id);
create index exam_attempts_exam_idx on public.exam_attempts(exam_id);

create table public.answers (
  id                 uuid primary key default uuid_generate_v4(),
  attempt_id         uuid not null references public.exam_attempts(id) on delete cascade,
  question_id        uuid not null references public.questions(id),
  answer_text        text,
  selected_option_id uuid references public.options(id),
  saved_at           timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index answers_attempt_idx on public.answers(attempt_id);

-- ─── storage bucket ──────────────────────────────────────────────────────
-- Created declaratively here so a fresh `supabase db reset` provisions it.
-- Production already has the bucket; insert is idempotent.

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;
