-- Question bank: copy a set of existing questions (with their options)
-- into a target exam, preserving text, type, points, and is_correct.
--
-- The "bank" is virtual — it's just every question the lecturer has
-- authored across all their exams, surfaced via existing RLS on the
-- questions table. This function provides the atomic clone path the
-- frontend's bank-picker uses to insert N questions in one round-trip.
-- Each cloned row gets a fresh uuid and new option uuids; the originals
-- are unchanged so already-deployed exams keep stable question identity.

create or replace function public.clone_questions_to_exam(
  p_target_exam_id      uuid,
  p_source_question_ids uuid[]
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_is_admin  boolean := public.is_admin();
  v_max_order int;
  v_new_ids   uuid[] := array[]::uuid[];
  v_source_ok int;
  rec         record;
  v_new_id    uuid;
  v_offset    int := 0;
begin
  if v_user_id is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- Authorisation on the target: caller must be admin or own the exam.
  if not (v_is_admin or public.owns_exam(p_target_exam_id)) then
    raise exception 'forbidden: target exam' using errcode = '42501';
  end if;

  -- Authorisation on each source: caller must be admin, or every source
  -- question must live in an exam the caller owns. Cloning from another
  -- lecturer's exam is intentionally disallowed.
  if not v_is_admin then
    select count(*) into v_source_ok
    from public.questions q
    join public.exams e on e.id = q.exam_id
    where q.id = any(p_source_question_ids)
      and e.created_by = v_user_id;
    if v_source_ok <> coalesce(array_length(p_source_question_ids, 1), 0) then
      raise exception 'forbidden: one or more source questions are not yours' using errcode = '42501';
    end if;
  end if;

  -- Append at the end, preserving the order the caller asked for.
  select coalesce(max(order_index), -1) into v_max_order
  from public.questions where exam_id = p_target_exam_id;

  for rec in
    select q.id, q.text, q.question_type, q.points,
           array_position(p_source_question_ids, q.id) as input_order
    from public.questions q
    where q.id = any(p_source_question_ids)
    order by array_position(p_source_question_ids, q.id)
  loop
    insert into public.questions (exam_id, text, question_type, points, order_index)
      values (p_target_exam_id, rec.text, rec.question_type, rec.points, v_max_order + 1 + v_offset)
      returning id into v_new_id;

    insert into public.options (question_id, text, is_correct, order_index)
    select v_new_id, o.text, o.is_correct, o.order_index
    from public.options o where o.question_id = rec.id
    order by o.order_index;

    v_new_ids := v_new_ids || v_new_id;
    v_offset := v_offset + 1;
  end loop;

  return v_new_ids;
end;
$$;

revoke execute on function public.clone_questions_to_exam(uuid, uuid[]) from public, anon;
grant execute on function public.clone_questions_to_exam(uuid, uuid[]) to authenticated;
