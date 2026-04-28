-- Ensure server-side DEFAULTs on boolean/integer columns that Alembic
-- managed via Python-side SQLAlchemy `default=...` values (which never
-- become Postgres defaults).
--
-- Without these, supabase-js inserts that omit the field — e.g. exam
-- creation, which lets is_published fall back to the column default —
-- fail with `null value in column "..." violates not-null constraint`.
--
-- Safe on fresh installs: ALTER COLUMN ... SET DEFAULT is a no-op when
-- the same default is already in place.

alter table public.exams         alter column is_published      set default false;
alter table public.exams         alter column shuffle_questions  set default false;
alter table public.exams         alter column shuffle_options    set default false;

alter table public.exam_attempts alter column is_submitted       set default false;
alter table public.exam_attempts alter column tab_switches       set default 0;
alter table public.exam_attempts alter column disconnect_events  set default 0;

alter table public.questions     alter column order_index        set default 0;
alter table public.questions     alter column points              set default 1;

alter table public.options       alter column is_correct          set default false;
alter table public.options       alter column order_index         set default 0;
