create table if not exists public.dj_intelligence_jobs (
  id bigint generated always as identity primary key,
  job_key text not null unique,
  job_type text not null,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','cancelled')),
  priority smallint not null default 50,
  event_id uuid not null,
  device_id text not null,
  track_id text not null,
  rb_local_usn bigint,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0
    check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dj_intelligence_jobs_pending
  on public.dj_intelligence_jobs (status, priority desc, available_at, created_at);

create index if not exists idx_dj_intelligence_jobs_track
  on public.dj_intelligence_jobs (device_id, track_id, created_at desc);

create index if not exists idx_dj_intelligence_jobs_event
  on public.dj_intelligence_jobs (event_id);

create index if not exists idx_dj_intelligence_jobs_type_status
  on public.dj_intelligence_jobs (job_type, status, created_at desc);

comment on table public.dj_intelligence_jobs is
  'Durable job queue for DJ Copilot intelligence enrichment and learning work. Enqueued by n8n; processed by a later worker phase.';

comment on column public.dj_intelligence_jobs.job_key is
  'Idempotency key. Duplicate enqueue attempts must not create duplicate jobs.';

comment on column public.dj_intelligence_jobs.payload is
  'Immutable snapshot of the event/intelligence context required by the worker.';
