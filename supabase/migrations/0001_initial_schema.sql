-- Initial schema for the SMU exam app.
--
-- This file is idempotent: it runs cleanly on a fresh Supabase project
-- AND on a project that already has the legacy Alembic-managed schema
-- from the prior FastAPI deployment. The CREATE statements use
-- IF NOT EXISTS; constraint additions are guarded with pg_constraint
-- checks. A reconciliation block at the bottom handles the column-type
-- drift between Alembic (TEXT-based UUIDs) and this migration (native
-- UUID columns).

create extension if not exists "uuid-ossp";

-- ─── tables ──────────────────────────────────────────────────────────────

create table if not exists public.users (
  id            uuid primary key default uuid_generate_v4(),
  email         text not null unique,
  name          text,
  password_hash text,
  role          text not null check (role in ('super_admin','admin','lecturer','student')),
  created_at    timestamptz not null default now()
);
create index if not exists users_role_idx on public.users(role);

create table if not exists public.schools (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.degrees (
  id         uuid primary key default uuid_generate_v4(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists degrees_school_idx on public.degrees(school_id);

create table if not exists public.courses (
  id          uuid primary key default uuid_generate_v4(),
  degree_id   uuid not null references public.degrees(id) on delete cascade,
  lecturer_id uuid references public.users(id) on delete set null,
  name        text not null,
  code        text not null unique,
  created_at  timestamptz not null default now()
);
create index if not exists courses_degree_idx on public.courses(degree_id);
create index if not exists courses_lecturer_idx on public.courses(lecturer_id);

create table if not exists public.enrollments (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references public.users(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (student_id, course_id)
);
create index if not exists enrollments_course_idx on public.enrollments(course_id);

create table if not exists public.exams (
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
create index if not exists exams_course_idx on public.exams(course_id);
create index if not exists exams_created_by_idx on public.exams(created_by);

create table if not exists public.questions (
  id            uuid primary key default uuid_generate_v4(),
  exam_id       uuid not null references public.exams(id) on delete cascade,
  text          text not null,
  question_type text not null check (question_type in ('mcq','true_false','short_answer')),
  order_index   integer not null default 0,
  points        integer not null default 1 check (points >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists questions_exam_idx on public.questions(exam_id);

create table if not exists public.options (
  id          uuid primary key default uuid_generate_v4(),
  question_id uuid not null references public.questions(id) on delete cascade,
  text        text not null,
  is_correct  boolean not null default false,
  order_index integer not null default 0
);
create index if not exists options_question_idx on public.options(question_id);

create table if not exists public.exam_attempts (
  id                uuid primary key default uuid_generate_v4(),
  exam_id           uuid not null references public.exams(id),
  student_id        uuid not null references public.users(id),
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  is_submitted      boolean not null default false,
  tab_switches      integer not null default 0,
  disconnect_events integer not null default 0,
  pdf_path          text,
  question_order    text,
  option_orders     text,
  unique (exam_id, student_id)
);
create index if not exists exam_attempts_student_idx on public.exam_attempts(student_id);
create index if not exists exam_attempts_exam_idx on public.exam_attempts(exam_id);

create table if not exists public.answers (
  id                 uuid primary key default uuid_generate_v4(),
  attempt_id         uuid not null references public.exam_attempts(id) on delete cascade,
  question_id        uuid not null references public.questions(id),
  answer_text        text,
  selected_option_id uuid references public.options(id),
  saved_at           timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index if not exists answers_attempt_idx on public.answers(attempt_id);

-- ─── reconciliation: legacy Alembic schema → this declaration ────────────
-- These ALTER statements are no-ops on fresh installs (the column already
-- has the target type, default, or constraint). They only do work when
-- this migration is re-applied to a database that previously held the
-- Alembic-managed schema, where IDs were stored as TEXT and the FK to
-- auth.users + several CHECK constraints were not present.

-- Convert TEXT/VARCHAR id columns to UUID. We must temporarily drop every
-- foreign key in the public schema before altering, because Postgres
-- refuses ALTER COLUMN TYPE when a column is referenced by an FK whose
-- other side has a different type. We capture pg_get_constraintdef() for
-- each FK, drop it, run the ALTERs, then recreate the FK from its saved
-- definition. The USING cast assumes every existing value is a valid
-- UUID string (Alembic generated them via python-uuid.uuid4()); a bad
-- value will raise and abort the whole migration — preferable to
-- silently corrupting data.

do $reconcile$
declare
  rec record;
begin
  -- Snapshot FK definitions.
  drop table if exists _fk_backup;
  create temp table _fk_backup (rel text, name text, defn text);
  insert into _fk_backup
    select conrelid::regclass::text, conname, pg_get_constraintdef(oid)
    from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace;

  -- Drop them.
  for rec in select * from _fk_backup loop
    execute format('alter table %s drop constraint %I', rec.rel, rec.name);
  end loop;

  -- Alter id-style columns currently typed as text/varchar.
  for rec in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name in (
        'id','school_id','degree_id','course_id','lecturer_id','student_id',
        'exam_id','created_by','question_id','attempt_id','selected_option_id'
      )
      and c.table_name in (
        'users','schools','degrees','courses','enrollments','exams',
        'questions','options','exam_attempts','answers'
      )
      and c.data_type in ('text','character varying')
  loop
    execute format(
      'alter table public.%I alter column %I type uuid using %I::uuid',
      rec.table_name, rec.column_name, rec.column_name
    );
  end loop;

  -- Recreate FKs with their original definitions and names.
  for rec in select * from _fk_backup loop
    execute format('alter table %s add constraint %I %s', rec.rel, rec.name, rec.defn);
  end loop;

  drop table _fk_backup;
end
$reconcile$;

-- Ensure UUID defaults on primary keys (Alembic generated IDs in Python).
alter table public.users         alter column id set default uuid_generate_v4();
alter table public.schools       alter column id set default uuid_generate_v4();
alter table public.degrees       alter column id set default uuid_generate_v4();
alter table public.courses       alter column id set default uuid_generate_v4();
alter table public.enrollments   alter column id set default uuid_generate_v4();
alter table public.exams         alter column id set default uuid_generate_v4();
alter table public.questions     alter column id set default uuid_generate_v4();
alter table public.options       alter column id set default uuid_generate_v4();
alter table public.exam_attempts alter column id set default uuid_generate_v4();
alter table public.answers       alter column id set default uuid_generate_v4();

-- Add the FK from public.users.id to auth.users(id) if missing. This was
-- not part of the Alembic schema but is essential here so the
-- admin-user-management edge function and the on-delete-cascade behaviour
-- both work.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_id_fkey' and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end
$$;

-- Add CHECK constraints if missing.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_role_check' and conrelid = 'public.users'::regclass) then
    alter table public.users add constraint users_role_check check (role in ('super_admin','admin','lecturer','student'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exams_duration_minutes_check' and conrelid = 'public.exams'::regclass) then
    alter table public.exams add constraint exams_duration_minutes_check check (duration_minutes > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'questions_question_type_check' and conrelid = 'public.questions'::regclass) then
    alter table public.questions add constraint questions_question_type_check check (question_type in ('mcq','true_false','short_answer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'questions_points_check' and conrelid = 'public.questions'::regclass) then
    alter table public.questions add constraint questions_points_check check (points >= 0);
  end if;
end
$$;

-- ─── storage bucket ──────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;
