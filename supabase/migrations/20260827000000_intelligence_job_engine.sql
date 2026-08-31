alter table public.dj_intelligence_jobs
  add column if not exists locked_by text;

create index if not exists idx_dj_intelligence_jobs_lease
  on public.dj_intelligence_jobs (
    status,
    locked_at
  );

create or replace function public.requeue_stale_intelligence_jobs(
  p_lease_seconds integer default 120
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_lease_seconds < 1 then
    raise exception
      'invalid_lease_seconds';
  end if;

  update public.dj_intelligence_jobs
  set
    status = 'pending',
    locked_at = null,
    locked_by = null,
    started_at = null,
    updated_at = now(),
    last_error = coalesce(
      last_error,
      'Job lease expired and job was requeued.'
    )
  where status = 'running'
    and locked_at is not null
    and locked_at <
      now() - make_interval(
        secs => p_lease_seconds
      );

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.claim_intelligence_jobs(
  p_device_id text,
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.dj_intelligence_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_device_id), '') is null then
    raise exception 'device_id_required';
  end if;

  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker_id_required';
  end if;

  if p_limit < 1 or p_limit > 50 then
    raise exception 'limit_out_of_range';
  end if;

  if p_lease_seconds < 30
     or p_lease_seconds > 900 then
    raise exception 'lease_seconds_out_of_range';
  end if;

  perform public.requeue_stale_intelligence_jobs(
    p_lease_seconds
  );

  return query
  with claimed as (
    select j.id
    from public.dj_intelligence_jobs j
    where j.status = 'pending'
      and j.device_id =
        trim(p_device_id)
      and j.available_at <= now()
    order by
      j.priority desc,
      j.created_at asc,
      j.id asc
    for update skip locked
    limit p_limit
  )
  update public.dj_intelligence_jobs j
  set
    status = 'running',
    attempts = j.attempts + 1,
    locked_at = now(),
    locked_by = trim(p_worker_id),
    started_at = coalesce(
      j.started_at,
      now()
    ),
    updated_at = now()
  where j.id in (
    select id from claimed
  )
  returning j.*;
end;
$$;

create or replace function public.complete_intelligence_job(
  p_job_id bigint,
  p_worker_id text
)
returns public.dj_intelligence_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.dj_intelligence_jobs;
begin
  select *
  into v_job
  from public.dj_intelligence_jobs
  where id = p_job_id
    and status = 'running'
    and locked_by = trim(p_worker_id)
  for update;

  if not found then
    raise exception
      'job_lease_not_owned';
  end if;

  update public.dj_intelligence_jobs
  set
    status = 'completed',
    completed_at = now(),
    locked_at = null,
    locked_by = null,
    updated_at = now(),
    last_error = null
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.fail_intelligence_job(
  p_job_id bigint,
  p_worker_id text,
  p_error text,
  p_retryable boolean default true,
  p_max_attempts integer default 10,
  p_retry_delay_seconds integer default 30
)
returns public.dj_intelligence_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.dj_intelligence_jobs;
  v_next_status text;
begin
  if p_max_attempts < 1 then
    raise exception 'max_attempts_out_of_range';
  end if;

  if p_retry_delay_seconds < 0
     or p_retry_delay_seconds > 3600 then
    raise exception 'retry_delay_out_of_range';
  end if;

  select *
  into v_job
  from public.dj_intelligence_jobs
  where id = p_job_id
    and status = 'running'
    and locked_by = trim(p_worker_id)
  for update;

  if not found then
    raise exception
      'job_lease_not_owned';
  end if;

  v_next_status :=
    case
      when p_retryable
       and v_job.attempts < p_max_attempts
        then 'pending'
      else 'failed'
    end;

  update public.dj_intelligence_jobs
  set
    status = v_next_status,
    completed_at =
      case
        when v_next_status = 'failed'
          then now()
        else null
      end,
    locked_at = null,
    locked_by = null,
    available_at =
      case
        when v_next_status = 'pending'
          then now() +
            make_interval(
              secs => p_retry_delay_seconds
            )
        else available_at
      end,
    last_error =
      left(
        coalesce(
          nullif(trim(p_error), ''),
          'Unknown job execution error.'
        ),
        4000
      ),
    updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function
  public.requeue_stale_intelligence_jobs(integer)
from public;

revoke all on function
  public.claim_intelligence_jobs(text, text, integer, integer)
from public;

revoke all on function
  public.complete_intelligence_job(bigint, text)
from public;

revoke all on function
  public.fail_intelligence_job(
    bigint,
    text,
    text,
    boolean,
    integer,
    integer
  )
from public;