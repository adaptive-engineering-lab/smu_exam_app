-- Timestamped log of student integrity events (tab switches, disconnects).
-- The existing exam_attempts.tab_switches / disconnect_events counters
-- are kept for back-compat and the lecturer's at-a-glance summary;
-- attempt_events stores the individual occurrences so reviewers can see
-- *when* and *in what pattern* events happened.

create table if not exists public.attempt_events (
  id          uuid primary key default uuid_generate_v4(),
  attempt_id  uuid not null references public.exam_attempts(id) on delete cascade,
  event_type  text not null check (event_type in ('tab_switch','disconnect')),
  occurred_at timestamptz not null default now()
);

create index if not exists attempt_events_attempt_idx
  on public.attempt_events(attempt_id, occurred_at desc);

alter table public.attempt_events enable row level security;

-- Read access mirrors exam_attempts: self student, admin, or owning lecturer.
create policy attempt_events_read on public.attempt_events
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.exam_attempts a
      where a.id = attempt_events.attempt_id
        and (a.student_id = auth.uid() or public.owns_exam(a.exam_id))
    )
  );

-- Inserts only happen via the SECURITY DEFINER function below; no INSERT
-- policy means PostgREST writes from any user role are denied.
revoke all on table public.attempt_events from anon;

-- Replace log_integrity_event so each call also writes a timestamped row.
-- The counter UPDATE is unchanged from 0003; the INSERT is additive.
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

  insert into public.attempt_events (attempt_id, event_type)
    values (p_attempt_id, p_event_type);
end;
$$;

revoke execute on function public.log_integrity_event(uuid, text) from public, anon;
grant execute on function public.log_integrity_event(uuid, text) to authenticated;
