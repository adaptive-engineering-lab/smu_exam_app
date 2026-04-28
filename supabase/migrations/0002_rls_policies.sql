-- Row-Level Security policies for the SMU exam app.
-- Source of truth for role: public.users.role (NOT JWT claims). The helpers
-- below are SECURITY DEFINER to avoid recursing into the policies on
-- public.users when other policies look up the caller's role.
--
-- Default stance with RLS enabled and no matching policy is DENY. Writes to
-- privileged tables (users, schools, degrees, courses, enrollments) happen
-- through edge functions running under the service-role key; no policy is
-- needed for those paths because the service role bypasses RLS.

-- ─── helper functions ────────────────────────────────────────────────────

create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('admin','super_admin') from public.users where id = auth.uid()),
    false
  )
$$;

create or replace function public.is_lecturer_of_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.courses
    where id = p_course_id and lecturer_id = auth.uid()
  )
$$;

create or replace function public.owns_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.exams
    where id = p_exam_id and created_by = auth.uid()
  )
$$;

create or replace function public.is_enrolled_in_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exams e
    join public.enrollments en
      on en.course_id = e.course_id and en.student_id = auth.uid()
    where e.id = p_exam_id
      and e.is_published
      and (e.available_from is null or e.available_from <= now())
      and (e.available_until is null or e.available_until >= now())
  )
$$;

create or replace function public.has_attempt_for_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.exam_attempts
    where exam_id = p_exam_id and student_id = auth.uid()
  )
$$;

-- ─── enable RLS on every app table ───────────────────────────────────────

alter table public.users          enable row level security;
alter table public.schools        enable row level security;
alter table public.degrees        enable row level security;
alter table public.courses        enable row level security;
alter table public.enrollments    enable row level security;
alter table public.exams          enable row level security;
alter table public.questions      enable row level security;
alter table public.options        enable row level security;
alter table public.exam_attempts  enable row level security;
alter table public.answers        enable row level security;

-- ─── users ───────────────────────────────────────────────────────────────
-- Read: own row OR admin. Writes: service role only (admin-user-management).

create policy users_self_or_admin_read on public.users
  for select
  using (id = auth.uid() or public.is_admin());

-- ─── schools / degrees / courses ─────────────────────────────────────────
-- Read: any authenticated. Writes: admin only.

create policy schools_authenticated_read on public.schools
  for select using (auth.uid() is not null);
create policy schools_admin_write on public.schools
  for all using (public.is_admin()) with check (public.is_admin());

create policy degrees_authenticated_read on public.degrees
  for select using (auth.uid() is not null);
create policy degrees_admin_write on public.degrees
  for all using (public.is_admin()) with check (public.is_admin());

create policy courses_authenticated_read on public.courses
  for select using (auth.uid() is not null);
create policy courses_admin_write on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- ─── enrollments ────────────────────────────────────────────────────────
-- Read: self student, admin, lecturer-of-course. Writes: admin only.

create policy enrollments_read on public.enrollments
  for select
  using (
    student_id = auth.uid()
    or public.is_admin()
    or public.is_lecturer_of_course(course_id)
  );
create policy enrollments_admin_write on public.enrollments
  for all using (public.is_admin()) with check (public.is_admin());

-- ─── exams ──────────────────────────────────────────────────────────────
-- Read:
--   admin       → all
--   lecturer    → exams they created
--   student     → published exams in their enrolled courses, currently in window
-- Insert: admin OR lecturer (and created_by must be themselves)
-- Update/Delete: admin OR creating lecturer

create policy exams_read on public.exams
  for select
  using (
    public.is_admin()
    or created_by = auth.uid()
    or (
      public.auth_role() = 'student'
      and is_published
      and (available_from is null or available_from <= now())
      and (available_until is null or available_until >= now())
      and exists (
        select 1 from public.enrollments en
        where en.course_id = public.exams.course_id
          and en.student_id = auth.uid()
      )
    )
  );

create policy exams_insert_lecturer_or_admin on public.exams
  for insert
  with check (
    (public.is_admin() or public.auth_role() = 'lecturer')
    and created_by = auth.uid()
  );

create policy exams_update_owner_or_admin on public.exams
  for update
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

create policy exams_delete_owner_or_admin on public.exams
  for delete
  using (public.is_admin() or created_by = auth.uid());

-- ─── questions ──────────────────────────────────────────────────────────
-- Read: anyone with read access on the parent exam, BUT students only after
-- they have an attempt for that exam (prevents pre-reading questions).
-- Writes: admin or owning lecturer.

create policy questions_read on public.questions
  for select
  using (
    public.is_admin()
    or public.owns_exam(exam_id)
    or (public.auth_role() = 'student' and public.has_attempt_for_exam(exam_id))
  );

create policy questions_write on public.questions
  for all
  using (public.is_admin() or public.owns_exam(exam_id))
  with check (public.is_admin() or public.owns_exam(exam_id));

-- ─── options ────────────────────────────────────────────────────────────
-- Same access pattern as questions, traversed via question_id. We deliberately
-- DO NOT expose `is_correct` to students — the frontend must select only the
-- columns it needs (id, text, order_index). RLS cannot mask columns; we'll
-- enforce this at the query layer in api/exams.ts.

create policy options_read on public.options
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.questions q
      where q.id = options.question_id
        and (
          public.owns_exam(q.exam_id)
          or (public.auth_role() = 'student' and public.has_attempt_for_exam(q.exam_id))
        )
    )
  );

create policy options_write on public.options
  for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.questions q
      where q.id = options.question_id and public.owns_exam(q.exam_id)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.questions q
      where q.id = options.question_id and public.owns_exam(q.exam_id)
    )
  );

-- ─── exam_attempts ──────────────────────────────────────────────────────
-- Read: student own, admin, owning lecturer.
-- Insert/Update: students operate via the begin_or_resume_attempt and submit
-- paths (DB function + edge function under service role). For autosave-side
-- updates of integrity counters from the client, we allow the student to
-- update their own attempt while NOT submitted, but a trigger below blocks
-- changes to is_submitted/submitted_at/pdf_path from non-service-role callers.

create policy exam_attempts_read on public.exam_attempts
  for select
  using (
    student_id = auth.uid()
    or public.is_admin()
    or public.owns_exam(exam_id)
  );

create policy exam_attempts_student_update on public.exam_attempts
  for update
  using (student_id = auth.uid() and not is_submitted)
  with check (student_id = auth.uid() and not is_submitted);

-- Insert is performed by the begin_or_resume_attempt() DB function which is
-- SECURITY DEFINER, so no insert policy is needed.

-- Defense-in-depth: prevent students from flipping submission/PDF fields via
-- direct update. The submit-attempt edge function uses the service role and
-- bypasses RLS + this trigger.

create or replace function public.exam_attempts_guard_submit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.uid() is not null)  -- request is from a JWT user, not service role
     and (
       new.is_submitted is distinct from old.is_submitted
       or new.submitted_at is distinct from old.submitted_at
       or new.pdf_path is distinct from old.pdf_path
       or new.question_order is distinct from old.question_order
       or new.option_orders is distinct from old.option_orders
     ) then
    raise exception 'submission fields are read-only from client; use submit-attempt edge function';
  end if;
  return new;
end;
$$;

create trigger exam_attempts_guard_submit_fields_trg
  before update on public.exam_attempts
  for each row execute function public.exam_attempts_guard_submit_fields();

-- ─── answers ────────────────────────────────────────────────────────────
-- Read: same access path as the parent attempt.
-- Write: student can insert/update their own attempt's answers while it is
-- still open. Bulk autosave from the client uses these direct writes via
-- supabase-js .upsert(); the bulk_upsert_answers RPC is an alternative that
-- imposes the same checks server-side.

create policy answers_read on public.answers
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.exam_attempts a
      where a.id = answers.attempt_id
        and (a.student_id = auth.uid() or public.owns_exam(a.exam_id))
    )
  );

create policy answers_student_write on public.answers
  for all
  using (
    exists (
      select 1 from public.exam_attempts a
      where a.id = answers.attempt_id
        and a.student_id = auth.uid()
        and not a.is_submitted
    )
  )
  with check (
    exists (
      select 1 from public.exam_attempts a
      where a.id = answers.attempt_id
        and a.student_id = auth.uid()
        and not a.is_submitted
    )
  );

-- ─── helper function privileges ─────────────────────────────────────────
-- These helpers are RLS-internal — used inside policy expressions by the
-- `authenticated` role, never by anonymous callers. Supabase's default
-- function-creation grants put EXECUTE on every public function for both
-- `anon` and `authenticated` explicitly (not via PUBLIC), so we have to
-- revoke from each role by name. We keep the grant on `authenticated` so
-- RLS evaluation still works.

revoke execute on function
  public.auth_role(),
  public.is_admin(),
  public.is_lecturer_of_course(uuid),
  public.owns_exam(uuid),
  public.is_enrolled_in_exam(uuid),
  public.has_attempt_for_exam(uuid)
from anon, public;

-- The trigger function only fires from the BEFORE UPDATE trigger, never via
-- RPC. Strip user-level EXECUTE entirely.
revoke execute on function public.exam_attempts_guard_submit_fields()
  from anon, authenticated, public;

-- ─── revoke anon access to app tables ───────────────────────────────────
-- Supabase grants SELECT to both `anon` and `authenticated` on every public
-- table by default. Our app requires authentication for all reads, so we
-- revoke from `anon` to remove the table from the anon GraphQL schema
-- entirely. RLS still gates row-level access for `authenticated`.

revoke all on table
  public.users, public.schools, public.degrees, public.courses,
  public.enrollments, public.exams, public.questions, public.options,
  public.exam_attempts, public.answers
from anon;

-- ─── storage: submissions bucket ────────────────────────────────────────
-- No policies on storage.objects for the submissions bucket → all access is
-- denied except via the service role. The get-attempt-pdf edge function
-- creates short-lived signed URLs that bypass RLS.
