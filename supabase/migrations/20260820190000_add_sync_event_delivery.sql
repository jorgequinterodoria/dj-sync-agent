-- N8N EVENT DELIVERY / OUTBOX LEASES
-- Additive production migration.
--
-- The event producer is already transactional with sync ingestion.
-- This migration adds safe concurrent claiming and delivery state.
--
-- Security:
--   Functions are SECURITY DEFINER with an empty search_path and fully
--   qualified object references.
--   Execution is restricted to service_role.

alter table public.sync_events
  add column if not exists lease_until timestamptz;

alter table public.sync_events
  add column if not exists locked_by text;

create index if not exists sync_events_claim_idx
  on public.sync_events(status, next_attempt_at, created_at);

create index if not exists sync_events_lease_idx
  on public.sync_events(status, lease_until);

-- Claim a batch of events atomically.
--
-- Expired deliveries are returned to pending first. Then eligible pending
-- events are locked with SKIP LOCKED and moved to delivering.
create or replace function public.claim_sync_events(
  p_worker_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 120
)
returns setof public.sync_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'worker_id_required';
  end if;

  if p_limit < 1 or p_limit > 500 then
    raise exception using
      errcode = 'P0001',
      message = 'limit_out_of_range';
  end if;

  if p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception using
      errcode = 'P0001',
      message = 'lease_seconds_out_of_range';
  end if;

  -- Recover abandoned deliveries.
  update public.sync_events
  set
    status = 'pending',
    locked_by = null,
    lease_until = null,
    next_attempt_at = now()
  where status = 'delivering'
    and lease_until is not null
    and lease_until <= now();

  return query
  with candidates as (
    select e.event_id
    from public.sync_events e
    where e.status = 'pending'
      and e.next_attempt_at <= now()
    order by e.created_at, e.event_id
    for update skip locked
    limit p_limit
  )
  update public.sync_events e
  set
    status = 'delivering',
    attempts = e.attempts + 1,
    locked_by = p_worker_id,
    lease_until = now() + make_interval(secs => p_lease_seconds)
  from candidates c
  where e.event_id = c.event_id
  returning e.*;
end;
$$;

revoke all on function public.claim_sync_events(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.claim_sync_events(text, integer, integer)
  to service_role;


-- Mark an event successfully delivered.
-- Only the worker that owns the current lease may acknowledge it.
create or replace function public.mark_sync_event_delivered(
  p_event_id uuid,
  p_worker_id text
)
returns public.sync_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.sync_events;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'worker_id_required';
  end if;

  update public.sync_events
  set
    status = 'delivered',
    delivered_at = now(),
    locked_by = null,
    lease_until = null,
    next_attempt_at = now(),
    last_error = null
  where event_id = p_event_id
    and status = 'delivering'
    and locked_by = p_worker_id
  returning * into v_event;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'event_delivery_lease_lost';
  end if;

  return v_event;
end;
$$;

revoke all on function public.mark_sync_event_delivered(uuid, text)
  from public, anon, authenticated;

grant execute on function public.mark_sync_event_delivered(uuid, text)
  to service_role;


-- Mark a delivery attempt as failed.
--
-- Retryable failures return to pending with an explicit delay.
-- Permanent failures, or events that reached the attempt limit, become
-- dead_letter and retain the last error for operator inspection.
create or replace function public.mark_sync_event_failed(
  p_event_id uuid,
  p_worker_id text,
  p_error text,
  p_retryable boolean default true,
  p_max_attempts integer default 10,
  p_retry_delay_seconds integer default 60
)
returns public.sync_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.sync_events;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'worker_id_required';
  end if;

  if p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception using
      errcode = 'P0001',
      message = 'max_attempts_out_of_range';
  end if;

  if p_retry_delay_seconds < 0 or p_retry_delay_seconds > 86400 then
    raise exception using
      errcode = 'P0001',
      message = 'retry_delay_out_of_range';
  end if;

  update public.sync_events
  set
    status = case
      when not p_retryable or attempts >= p_max_attempts
        then 'dead_letter'
      else
        'pending'
      end,
    next_attempt_at = case
      when not p_retryable or attempts >= p_max_attempts
        then now()
      else
        now() + make_interval(secs => p_retry_delay_seconds)
      end,
    delivered_at = null,
    locked_by = null,
    lease_until = null,
    last_error = left(coalesce(p_error, 'delivery_failed'), 4000)
  where event_id = p_event_id
    and status = 'delivering'
    and locked_by = p_worker_id
  returning * into v_event;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'event_delivery_lease_lost';
  end if;

  return v_event;
end;
$$;

revoke all on function public.mark_sync_event_failed(
  uuid, text, text, boolean, integer, integer
) from public, anon, authenticated;

grant execute on function public.mark_sync_event_failed(
  uuid, text, text, boolean, integer, integer
) to service_role;


-- Operator/admin helper: return one event to pending manually.
-- This is intentionally service_role-only.
create or replace function public.requeue_sync_event(
  p_event_id uuid
)
returns public.sync_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.sync_events;
begin
  update public.sync_events
  set
    status = 'pending',
    next_attempt_at = now(),
    delivered_at = null,
    locked_by = null,
    lease_until = null,
    last_error = null
  where event_id = p_event_id
    and status in ('failed', 'dead_letter')
  returning * into v_event;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'event_not_requeueable';
  end if;

  return v_event;
end;
$$;

revoke all on function public.requeue_sync_event(uuid)
  from public, anon, authenticated;

grant execute on function public.requeue_sync_event(uuid)
  to service_role;
