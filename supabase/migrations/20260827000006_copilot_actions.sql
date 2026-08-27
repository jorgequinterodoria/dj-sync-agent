create table if not exists public.dj_copilot_action_runs (
  id bigint generated always as identity primary key,
  device_id text not null,
  track_id text not null,
  action_id uuid not null unique,
  action_type text not null
    check (action_type in ('audio.analyze','intelligence.refresh','memory.index','reasoning.run')),
  risk text not null
    check (risk in ('safe','review_required')),
  approved boolean not null default false,
  request text not null,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dj_copilot_action_runs_track
  on public.dj_copilot_action_runs (device_id, track_id, created_at desc);

create index if not exists idx_dj_copilot_action_runs_type
  on public.dj_copilot_action_runs (action_type, created_at desc);

comment on table public.dj_copilot_action_runs is
  'Durable audit history for validated Copilot actions executed by the Electron agent.';

create or replace function public.save_dj_copilot_action_run(
  p_device_id text,
  p_track_id text,
  p_action_id uuid,
  p_action_type text,
  p_risk text,
  p_approved boolean,
  p_request text,
  p_input jsonb,
  p_result jsonb
)
returns public.dj_copilot_action_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dj_copilot_action_runs;
begin
  if nullif(trim(p_device_id), '') is null then
    raise exception 'device_id_required';
  end if;

  if nullif(trim(p_track_id), '') is null then
    raise exception 'track_id_required';
  end if;

  if p_action_id is null then
    raise exception 'action_id_required';
  end if;

  if p_action_type not in (
    'audio.analyze',
    'intelligence.refresh',
    'memory.index',
    'reasoning.run'
  ) then
    raise exception 'unsupported_action_type:%', p_action_type;
  end if;

  if p_risk not in ('safe', 'review_required') then
    raise exception 'unsupported_action_risk:%', p_risk;
  end if;

  if p_risk = 'review_required' and coalesce(p_approved, false) = false then
    if coalesce(p_result->>'status', '') <> 'rejected' then
      raise exception 'approval_required';
    end if;
  end if;

  if nullif(trim(p_request), '') is null then
    raise exception 'request_required';
  end if;

  insert into public.dj_copilot_action_runs (
    device_id,
    track_id,
    action_id,
    action_type,
    risk,
    approved,
    request,
    input,
    result
  )
  values (
    trim(p_device_id),
    trim(p_track_id),
    p_action_id,
    p_action_type,
    p_risk,
    coalesce(p_approved, false),
    trim(p_request),
    coalesce(p_input, '{}'::jsonb),
    coalesce(p_result, '{}'::jsonb)
  )
  on conflict (action_id)
  do update set
    approved = excluded.approved,
    request = excluded.request,
    input = excluded.input,
    result = excluded.result
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.save_dj_copilot_action_run(
  text, text, uuid, text, text, boolean, text, jsonb, jsonb
) from public;
