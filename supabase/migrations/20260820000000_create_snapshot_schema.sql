create table if not exists public.sync_snapshot_sessions (
  session_id uuid primary key,
  device_id text not null references public.sync_devices(device_id) on delete restrict,
  status text not null check (
    status in ('staging', 'ready', 'committed', 'failed')
  ),
  expected_count integer not null check (expected_count >= 0),
  received_count integer not null default 0 check (received_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  last_error text
);

create table if not exists public.sync_snapshot_items (
  session_id uuid not null references public.sync_snapshot_sessions(session_id) on delete cascade,
  track_id text not null,
  track_uuid text,
  track_hash text not null,
  rb_local_usn bigint,
  updated_at timestamptz,
  track jsonb not null,
  created_at timestamptz not null default now(),
  primary key (session_id, track_id)
);

create index if not exists sync_snapshot_items_session_idx
  on public.sync_snapshot_items(session_id);

create index if not exists sync_snapshot_items_track_idx
  on public.sync_snapshot_items(track_id);

create table if not exists public.sync_tracks (
  device_id text not null references public.sync_devices(device_id) on delete restrict,
  track_id text not null,
  track_uuid text,
  track_hash text not null,
  rb_local_usn bigint,
  updated_at timestamptz,
  track jsonb not null,
  snapshot_session_id uuid not null,
  received_at timestamptz not null default now(),
  primary key (device_id, track_id)
);

create index if not exists sync_tracks_device_hash_idx
  on public.sync_tracks(device_id, track_hash);

create index if not exists sync_tracks_device_usn_idx
  on public.sync_tracks(device_id, rb_local_usn);

create or replace function public.ingest_snapshot_batch(
  p_device_id text,
  p_session_id uuid,
  p_expected_count integer,
  p_batch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sync_snapshot_sessions%rowtype;
  v_item jsonb;
  v_received integer;
  v_batch_count integer;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'device_id_required';
  end if;

  if p_session_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'session_id_required';
  end if;

  if p_expected_count < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_expected_count';
  end if;

  if jsonb_typeof(p_batch) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'batch_must_be_array';
  end if;

  select *
  into v_session
  from public.sync_snapshot_sessions
  where session_id = p_session_id
  for update;

  if not found then
    insert into public.sync_snapshot_sessions(
      session_id,
      device_id,
      status,
      expected_count
    )
    values (
      p_session_id,
      p_device_id,
      'staging',
      p_expected_count
    )
    returning * into v_session;
  else
    if v_session.device_id <> p_device_id then
      raise exception using
        errcode = 'P0001',
        message = 'snapshot_device_conflict';
    end if;

    if v_session.expected_count <> p_expected_count then
      raise exception using
        errcode = 'P0001',
        message = 'snapshot_count_conflict';
    end if;

    if v_session.status = 'committed' then
      return jsonb_build_object(
        'schemaVersion', 1,
        'accepted', true,
        'status', 'committed',
        'sessionId', p_session_id,
        'receivedCount', v_session.received_count,
        'expectedCount', v_session.expected_count
      );
    end if;

    if v_session.status = 'failed' then
      raise exception using
        errcode = 'P0001',
        message = 'snapshot_session_failed';
    end if;
  end if;

  v_batch_count := jsonb_array_length(p_batch);

  for v_item in
    select value from jsonb_array_elements(p_batch)
  loop
    if coalesce(v_item->>'id', '') = '' then
      raise exception using
        errcode = 'P0001',
        message = 'snapshot_track_id_required';
    end if;

    if coalesce(v_item->>'hash', '') = '' then
      raise exception using
        errcode = 'P0001',
        message = 'snapshot_track_hash_required';
    end if;

    if v_item->'track' is null
       or jsonb_typeof(v_item->'track') <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'snapshot_track_required';
    end if;

    insert into public.sync_snapshot_items(
      session_id,
      track_id,
      track_uuid,
      track_hash,
      rb_local_usn,
      updated_at,
      track
    )
    values (
      p_session_id,
      v_item->>'id',
      v_item->>'uuid',
      v_item->>'hash',
      nullif(v_item->>'rbLocalUsn', '')::bigint,
      nullif(v_item->>'updatedAt', '')::timestamptz,
      v_item->'track'
    )
    on conflict (session_id, track_id)
    do update set
      track_uuid = excluded.track_uuid,
      track_hash = excluded.track_hash,
      rb_local_usn = excluded.rb_local_usn,
      updated_at = excluded.updated_at,
      track = excluded.track;
  end loop;

  select count(*)
  into v_received
  from public.sync_snapshot_items
  where session_id = p_session_id;

  update public.sync_snapshot_sessions
  set
    received_count = v_received,
    status = case
      when v_received = expected_count then 'ready'
      else 'staging'
    end,
    updated_at = now()
  where session_id = p_session_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'accepted', true,
    'status',
    case
      when v_received = p_expected_count then 'ready'
      else 'staging'
    end,
    'sessionId', p_session_id,
    'batchCount', v_batch_count,
    'receivedCount', v_received,
    'expectedCount', p_expected_count
  );
end;
$$;

create or replace function public.commit_snapshot(
  p_device_id text,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sync_snapshot_sessions%rowtype;
begin
  select *
  into v_session
  from public.sync_snapshot_sessions
  where session_id = p_session_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'snapshot_session_not_found';
  end if;

  if v_session.device_id <> p_device_id then
    raise exception using
      errcode = 'P0001',
      message = 'snapshot_device_conflict';
  end if;

  if v_session.status = 'committed' then
    return jsonb_build_object(
      'schemaVersion', 1,
      'accepted', true,
      'status', 'committed',
      'sessionId', p_session_id,
      'receivedCount', v_session.received_count,
      'expectedCount', v_session.expected_count
    );
  end if;

  if v_session.received_count <> v_session.expected_count then
    raise exception using
      errcode = 'P0001',
      message = 'snapshot_incomplete';
  end if;

  delete from public.sync_tracks
  where device_id = p_device_id;

  insert into public.sync_tracks(
    device_id,
    track_id,
    track_uuid,
    track_hash,
    rb_local_usn,
    updated_at,
    track,
    snapshot_session_id
  )
  select
    p_device_id,
    track_id,
    track_uuid,
    track_hash,
    rb_local_usn,
    updated_at,
    track,
    p_session_id
  from public.sync_snapshot_items
  where session_id = p_session_id;

  update public.sync_snapshot_sessions
  set
    status = 'committed',
    committed_at = now(),
    updated_at = now()
  where session_id = p_session_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'accepted', true,
    'status', 'committed',
    'sessionId', p_session_id,
    'receivedCount', v_session.received_count,
    'expectedCount', v_session.expected_count
  );
end;
$$;

alter table public.sync_snapshot_sessions enable row level security;
alter table public.sync_snapshot_items enable row level security;
alter table public.sync_tracks enable row level security;

revoke all on table public.sync_snapshot_sessions from anon, authenticated;
revoke all on table public.sync_snapshot_items from anon, authenticated;
revoke all on table public.sync_tracks from anon, authenticated;

revoke all on function public.ingest_snapshot_batch(text, uuid, integer, jsonb)
  from public, anon, authenticated;

revoke all on function public.commit_snapshot(text, uuid)
  from public, anon, authenticated;

grant execute on function public.ingest_snapshot_batch(text, uuid, integer, jsonb)
  to service_role;

grant execute on function public.commit_snapshot(text, uuid)
  to service_role;
