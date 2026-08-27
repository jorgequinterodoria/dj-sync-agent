create table if not exists public.dj_recommendation_runs (
  id bigint generated always as identity primary key,
  device_id text not null,
  current_track_id text,
  request text not null,
  recommendation_id text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dj_recommendation_runs_track
  on public.dj_recommendation_runs (device_id, current_track_id, created_at desc);

create index if not exists idx_dj_recommendation_runs_device
  on public.dj_recommendation_runs (device_id, created_at desc);

create table if not exists public.dj_set_intelligence_runs (
  id bigint generated always as identity primary key,
  device_id text not null,
  request text not null,
  set_id text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dj_set_intelligence_runs_device
  on public.dj_set_intelligence_runs (device_id, created_at desc);

comment on table public.dj_recommendation_runs is
  'Auditable recommendation runs produced by the local DJ recommendation engine.';

comment on table public.dj_set_intelligence_runs is
  'Auditable set intelligence analyses produced by the local DJ recommendation engine.';
