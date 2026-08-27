create table if not exists public.dj_learning_events (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  device_id text not null,
  event_type text not null check (
    event_type in (
      'track_played',
      'track_skipped',
      'recommendation_accepted',
      'recommendation_rejected',
      'track_rated',
      'set_track_selected'
    )
  ),
  track_id text not null,
  occurred_at timestamptz not null,
  bpm numeric,
  energy numeric,
  genre text,
  key text,
  artist text,
  rating integer,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_dj_learning_events_device_time
  on public.dj_learning_events (device_id, occurred_at desc, event_id desc);

create index if not exists idx_dj_learning_events_track
  on public.dj_learning_events (device_id, track_id, occurred_at desc);

create table if not exists public.dj_personalization_profiles (
  id bigint generated always as identity primary key,
  device_id text not null unique,
  engine_version text not null,
  computed_at timestamptz not null,
  profile jsonb not null,
  confidence jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dj_personalization_profiles_device
  on public.dj_personalization_profiles (device_id);

comment on table public.dj_learning_events is
  'Durable behavioral evidence used by the local DJ Copilot personalization engine.';

comment on table public.dj_personalization_profiles is
  'Latest deterministic personalized DJ profile derived from learning events.';
