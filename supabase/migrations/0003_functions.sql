-- Postgres functions for transactional operations that don't fit cleanly
-- into a direct supabase-js call. Each function is SECURITY DEFINER and
-- enforces its own authorisation checks via auth.uid() and the helpers
-- declared in 0002_rls_policies.sql.
--
-- Direct PostgREST writes are still used where they suffice (e.g. autosave
-- of answers via .upsert(), single-row exam/course CRUD). These functions
-- exist only where multi-row atomicity, shuffle generation, or
-- guard-trigger bypass is required.

-- ─── begin_or_resume_attempt ────────────────────────────────────────────
-- Replaces POST /attempts/exams/{exam_id}/attempt. Validates the exam is
-- published and currently in window, idempotently returns an existing
-- non-submitted attempt, or inserts a fresh one with shuffle orders
-- populated when the exam requests them.

create or replace function public.begin_or_resume_attempt(p_exam_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam       public.exams;
  v_attempt    public.exam_attempts;
  v_now        timestamptz := now();
  v_user_id    uuid := auth.uid();
  v_question_order text;
  v_option_orders  text;
begin
  if v_user_id is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into v_exam from public.exams
    where id = p_exam_id and is_published = true;
  if not found then
    raise exception 'exam not found or not published' using errcode = 'P0002';
  end if;

  if v_exam.available_from is not null and v_now < v_exam.available_from then
    raise exception 'exam has not started yet' using errcode = 'P0001';
  end if;
  if v_exam.available_until is not null and v_now > v_exam.available_until then
    raise exception 'exam window has closed' using errcode = 'P0001';
  end if;

  -- enrolment check: student must be enrolled in the exam's course
  if not exists (
    select 1 from public.enrollments en
    where en.student_id = v_user_id and en.course_id = v_exam.course_id
  ) then
    raise exception 'not enrolled in this course' using errcode = '42501';
  end if;

  select * into v_attempt from public.exam_attempts
    where exam_id = p_exam_id and student_id = v_user_id;

  if found then
    if v_attempt.is_submitted then
      raise exception 'exam already submitted' using errcode = 'P0003';
    end if;
    return v_attempt;
  end if;

  -- compute shuffle orders if requested
  if v_exam.shuffle_questions then
    select to_jsonb(array_agg(id order by random()))::text
      into v_question_order
      from public.questions where exam_id = p_exam_id;
  end if;

  if v_exam.shuffle_options then
    select to_jsonb(coalesce(jsonb_object_agg(question_id, opts), '{}'::jsonb))::text
      into v_option_orders
      from (
        select q.id as question_id,
               to_jsonb(array_agg(o.id order by random())) as opts
        from public.questions q
        join public.options o on o.question_id = q.id
        where q.exam_id = p_exam_id
        group by q.id
      ) t;
  end if;

  insert into public.exam_attempts (exam_id, student_id, question_order, option_orders)
    values (p_exam_id, v_user_id, v_question_order, v_option_orders)
    returning * into v_attempt;

  return v_attempt;
end;
$$;

revoke execute on function public.begin_or_resume_attempt(uuid) from public, anon;
grant execute on function public.begin_or_resume_attempt(uuid) to authenticated;

-- ─── log_integrity_event ────────────────────────────────────────────────
-- Atomic increment for tab_switch / disconnect counters. The student RLS
-- policy on exam_attempts allows direct UPDATE while the attempt is open,
-- but a function gives us atomicity (no read-modify-write race) and a
-- single auth check.

create or replace function public.log_integrity_event(
  p_attempt_id uuid,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_event_type not in ('tab_switch', 'disconnect') then
    raise exception 'invalid event_type' using errcode = '22023';
  end if;

  update public.exam_attempts
    set tab_switches      = case when p_event_type = 'tab_switch' then tab_switches + 1 else tab_switches end,
        disconnect_events = case when p_event_type = 'disconnect' then disconnect_events + 1 else disconnect_events end
    where id = p_attempt_id
      and student_id = v_user_id
      and not is_submitted;

  if not found then
    raise exception 'attempt not found, not yours, or already submitted' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.log_integrity_event(uuid, text) from public, anon;
grant execute on function public.log_integrity_event(uuid, text) to authenticated;

-- ─── create_question_with_options ───────────────────────────────────────
-- Atomic insert of a question and its options for the lecturer/admin
-- exam-builder UI. Bulk CSV import (the import-questions-csv edge function)
-- calls this function once per row.

create or replace function public.create_question_with_options(
  p_exam_id       uuid,
  p_text          text,
  p_question_type text,
  p_points        int,
  p_order_index   int,
  p_options       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_id uuid;
begin
  if not (public.is_admin() or public.owns_exam(p_exam_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_question_type not in ('mcq','true_false','short_answer') then
    raise exception 'invalid question_type' using errcode = '22023';
  end if;

  insert into public.questions (exam_id, text, question_type, points, order_index)
    values (p_exam_id, p_text, p_question_type, coalesce(p_points, 1), coalesce(p_order_index, 0))
    returning id into v_question_id;

  if p_options is not null then
    insert into public.options (question_id, text, is_correct, order_index)
    select v_question_id,
           opt->>'text',
           coalesce((opt->>'is_correct')::boolean, false),
           coalesce((opt->>'order_index')::int, 0)
    from jsonb_array_elements(p_options) opt;
  end if;

  return v_question_id;
end;
$$;

revoke execute on function public.create_question_with_options(uuid, text, text, int, int, jsonb) from public, anon;
grant execute on function public.create_question_with_options(uuid, text, text, int, int, jsonb) to authenticated;

-- ─── update_question_with_options ───────────────────────────────────────
-- Atomically updates a question and replaces its options. Existing
-- answer.selected_option_id references are nulled first so the option
-- delete doesn't FK-fail; this matches the original FastAPI behaviour.
-- (Latent bug fix: the FastAPI code didn't null first and would crash if
-- any student had answered.)

create or replace function public.update_question_with_options(
  p_question_id   uuid,
  p_text          text,
  p_question_type text,
  p_points        int,
  p_order_index   int,
  p_options       jsonb  -- pass null to leave options unchanged
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
begin
  select exam_id into v_exam_id from public.questions where id = p_question_id;
  if v_exam_id is null then
    raise exception 'question not found' using errcode = 'P0002';
  end if;

  if not (public.is_admin() or public.owns_exam(v_exam_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_question_type is not null and p_question_type not in ('mcq','true_false','short_answer') then
    raise exception 'invalid question_type' using errcode = '22023';
  end if;

  update public.questions
    set text          = coalesce(p_text, text),
        question_type = coalesce(p_question_type, question_type),
        points        = coalesce(p_points, points),
        order_index   = coalesce(p_order_index, order_index)
    where id = p_question_id;

  if p_options is not null then
    update public.answers
      set selected_option_id = null
      where selected_option_id in (select id from public.options where question_id = p_question_id);

    delete from public.options where question_id = p_question_id;

    insert into public.options (question_id, text, is_correct, order_index)
    select p_question_id,
           opt->>'text',
           coalesce((opt->>'is_correct')::boolean, false),
           coalesce((opt->>'order_index')::int, 0)
    from jsonb_array_elements(p_options) opt;
  end if;
end;
$$;

revoke execute on function public.update_question_with_options(uuid, text, text, int, int, jsonb) from public, anon;
grant execute on function public.update_question_with_options(uuid, text, text, int, int, jsonb) to authenticated;
