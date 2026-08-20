-- N8N EVENT OUTBOX
-- Adds durable, idempotent events without changing the Rekordbox sync contract.
-- This migration is intentionally additive.

create table if not exists public.sync_events (
  event_id uuid primary key default gen_random_uuid(),

  schema_version integer not null default 1,

  device_id text not null
    references public.sync_devices(device_id)
    on delete restrict,

  message_id text not null
    references public.sync_batches(message_id)
    on delete cascade,

  event_type text not null check (
    event_type in (
      'track.added',
      'track.updated',
      'track.deleted'
    )
  ),

  aggregate_type text not null default 'track'
    check (aggregate_type = 'track'),

  aggregate_id text not null,

  rb_local_usn bigint,
  cursor_id text,
  occurred_at timestamptz not null default now(),

  payload jsonb not null,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'delivering',
        'delivered',
        'failed',
        'dead_letter'
      )
    ),

  attempts integer not null default 0
    check (attempts >= 0),

  next_attempt_at timestamptz not null default now(),

  delivered_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sync_events_message_track_action_uidx
    unique (message_id, event_type, aggregate_id)
);

create index if not exists sync_events_pending_idx
  on public.sync_events(status, next_attempt_at, created_at);

create index if not exists sync_events_device_cursor_idx
  on public.sync_events(device_id, rb_local_usn, aggregate_id);

create index if not exists sync_events_aggregate_idx
  on public.sync_events(aggregate_type, aggregate_id, created_at desc);

alter table public.sync_events enable row level security;

revoke all on table public.sync_events from public, anon, authenticated;
grant select, insert, update, delete on table public.sync_events to service_role;

-- Keep updated_at correct for direct service-role updates.
create or replace function public.set_sync_events_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_sync_events_updated_at() from public, anon, authenticated;
grant execute on function public.set_sync_events_updated_at() to service_role;

drop trigger if exists sync_events_updated_at on public.sync_events;

create trigger sync_events_updated_at
before update on public.sync_events
for each row
execute function public.set_sync_events_updated_at();

-- Production ingestion function:
-- existing sync behavior is preserved, with one additional event inserted
-- for every add/update/delete change in the same transaction.
create or replace function public.ingest_sync_batch(
  p_device_id text,
  p_envelope jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id text;
  v_idempotency_key text;
  v_payload_hash text;
  v_received_at timestamptz := now();

  v_before_usn bigint;
  v_before_id text;

  v_after_usn bigint;
  v_after_id text;

  v_has_more boolean;

  v_scanned integer;
  v_processed integer;
  v_added integer;
  v_updated integer;
  v_deleted integer;
  v_unchanged integer;

  v_existing_sync sync_idempotency%rowtype;
  v_current_cursor sync_cursors%rowtype;
  v_existing_batch sync_batches%rowtype;

  v_change jsonb;
  v_event_id uuid;
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'device_id_required';
  end if;

  v_message_id :=
    p_envelope #>> '{message,id}';

  v_idempotency_key :=
    p_envelope #>> '{message,idempotencyKey}';

  v_payload_hash :=
    p_envelope #>> '{integrity,payloadHash}';

  if v_message_id is null
     or v_idempotency_key is null
     or v_payload_hash is null then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_envelope_identity';
  end if;

  -- Idempotency lookup.
  select *
  into v_existing_sync
  from public.sync_idempotency
  where idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_existing_sync.device_id <> p_device_id
       or v_existing_sync.message_id <> v_message_id
       or v_existing_sync.payload_hash <> v_payload_hash then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    select *
    into v_existing_batch
    from public.sync_batches
    where message_id = v_message_id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_state_corrupt';
    end if;

    return jsonb_build_object(
      'schemaVersion', 1,
      'accepted', true,
      'duplicate', true,
      'idempotencyKey', v_idempotency_key,
      'messageId', v_message_id,
      'receivedAt', v_existing_batch.received_at,
      'cursor', jsonb_build_object(
        'before', case
          when v_existing_batch.cursor_before_usn is null then null
          else jsonb_build_object(
            'rbLocalUsn', v_existing_batch.cursor_before_usn,
            'id', v_existing_batch.cursor_before_id
          )
        end,
        'after', case
          when v_existing_batch.cursor_after_usn is null then null
          else jsonb_build_object(
            'rbLocalUsn', v_existing_batch.cursor_after_usn,
            'id', v_existing_batch.cursor_after_id
          )
        end,
        'hasMore', v_existing_batch.has_more
      )
    );
  end if;

  v_before_usn :=
    nullif(
      p_envelope #>> '{cursor,before,rbLocalUsn}',
      ''
    )::bigint;

  v_before_id :=
    p_envelope #>> '{cursor,before,id}';

  v_after_usn :=
    nullif(
      p_envelope #>> '{cursor,after,rbLocalUsn}',
      ''
    )::bigint;

  v_after_id :=
    p_envelope #>> '{cursor,after,id}';

  v_has_more :=
    coalesce(
      (p_envelope #>> '{cursor,hasMore}')::boolean,
      false
    );

  v_scanned :=
    coalesce(
      (p_envelope #>> '{counts,scanned}')::integer,
      0
    );

  v_processed :=
    coalesce(
      (p_envelope #>> '{counts,processed}')::integer,
      0
    );

  v_added :=
    coalesce(
      (p_envelope #>> '{counts,changes,added}')::integer,
      0
    );

  v_updated :=
    coalesce(
      (p_envelope #>> '{counts,changes,updated}')::integer,
      0
    );

  v_deleted :=
    coalesce(
      (p_envelope #>> '{counts,changes,deleted}')::integer,
      0
    );

  v_unchanged :=
    coalesce(
      (p_envelope #>> '{counts,changes,unchanged}')::integer,
      0
    );

  if v_scanned < 0
     or v_processed < 0
     or v_added < 0
     or v_updated < 0
     or v_deleted < 0
     or v_unchanged < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_counts';
  end if;

  if v_added + v_updated + v_deleted + v_unchanged <> v_processed then
    raise exception using
      errcode = 'P0001',
      message = 'count_invariant_failed';
  end if;

  -- Register device.
  insert into public.sync_devices(
    device_id,
    last_seen_at
  )
  values (
    p_device_id,
    v_received_at
  )
  on conflict (device_id)
  do update set
    last_seen_at = excluded.last_seen_at;

  -- Lock and inspect server cursor.
  select *
  into v_current_cursor
  from public.sync_cursors
  where device_id = p_device_id
  for update;

  if found then
    if v_current_cursor.rb_local_usn is distinct from v_before_usn
       or v_current_cursor.cursor_id is distinct from v_before_id then
      raise exception using
        errcode = 'P0001',
        message = 'cursor_conflict';
    end if;
  elsif v_before_usn is not null
        or v_before_id is not null then
    insert into public.sync_cursors(
      device_id,
      rb_local_usn,
      cursor_id,
      updated_at
    )
    values (
      p_device_id,
      v_before_usn,
      v_before_id,
      v_received_at
    );
  else
    insert into public.sync_cursors(
      device_id,
      rb_local_usn,
      cursor_id,
      updated_at
    )
    values (
      p_device_id,
      null,
      null,
      v_received_at
    );
  end if;

  -- Persist the batch.
  insert into public.sync_batches(
    message_id,
    idempotency_key,
    device_id,
    payload_hash,
    received_at,

    cursor_before_usn,
    cursor_before_id,
    cursor_after_usn,
    cursor_after_id,
    has_more,

    scanned,
    processed,
    added,
    updated,
    deleted,
    unchanged,

    envelope
  )
  values (
    v_message_id,
    v_idempotency_key,
    p_device_id,
    v_payload_hash,
    v_received_at,

    v_before_usn,
    v_before_id,
    v_after_usn,
    v_after_id,
    v_has_more,

    v_scanned,
    v_processed,
    v_added,
    v_updated,
    v_deleted,
    v_unchanged,

    p_envelope
  );

  insert into public.sync_idempotency(
    idempotency_key,
    device_id,
    message_id,
    payload_hash
  )
  values (
    v_idempotency_key,
    p_device_id,
    v_message_id,
    v_payload_hash
  );

  -- Added tracks.
  for v_change in
    select value
    from jsonb_array_elements(
      coalesce(
        p_envelope #> '{changes,added}',
        '[]'::jsonb
      )
    ) as value
  loop
    insert into public.sync_changes(
      message_id,
      device_id,
      action,
      track_id,
      track_uuid,
      track_hash,
      rb_local_usn,
      updated_at,
      track
    )
    values(
      v_message_id,
      p_device_id,
      'add',
      v_change->>'id',
      v_change->>'uuid',
      v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );

    perform public.apply_sync_track_change(
      p_device_id,
      'add',
      v_change->>'id',
      v_change->>'uuid',
      v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );

    v_event_id := gen_random_uuid();

    insert into public.sync_events(
      event_id,
      device_id,
      message_id,
      event_type,
      aggregate_id,
      rb_local_usn,
      cursor_id,
      occurred_at,
      payload
    )
    values (
      v_event_id,
      p_device_id,
      v_message_id,
      'track.added',
      v_change->>'id',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      v_after_id,
      coalesce(
        nullif(v_change->>'updatedAt','')::timestamptz,
        v_received_at
      ),
      jsonb_build_object(
        'schemaVersion', 1,
        'eventType', 'track.added',
        'eventId', v_event_id,
        'deviceId', p_device_id,
        'messageId', v_message_id,
        'cursor', jsonb_build_object(
          'rbLocalUsn', nullif(v_change->>'rbLocalUsn','')::bigint,
          'id', v_change->>'id'
        ),
        'data', jsonb_build_object(
          'trackId', v_change->>'id',
          'trackHash', v_change->>'hash'
        )
      )
    );
  end loop;

  -- Updated tracks.
  for v_change in
    select value
    from jsonb_array_elements(
      coalesce(
        p_envelope #> '{changes,updated}',
        '[]'::jsonb
      )
    ) as value
  loop
    insert into public.sync_changes(
      message_id,
      device_id,
      action,
      track_id,
      track_uuid,
      track_hash,
      rb_local_usn,
      updated_at,
      track
    )
    values(
      v_message_id,
      p_device_id,
      'update',
      v_change->>'id',
      v_change->>'uuid',
      v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );

    perform public.apply_sync_track_change(
      p_device_id,
      'update',
      v_change->>'id',
      v_change->>'uuid',
      v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );

    v_event_id := gen_random_uuid();

    insert into public.sync_events(
      event_id,
      device_id,
      message_id,
      event_type,
      aggregate_id,
      rb_local_usn,
      cursor_id,
      occurred_at,
      payload
    )
    values (
      v_event_id,
      p_device_id,
      v_message_id,
      'track.updated',
      v_change->>'id',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      v_after_id,
      coalesce(
        nullif(v_change->>'updatedAt','')::timestamptz,
        v_received_at
      ),
      jsonb_build_object(
        'schemaVersion', 1,
        'eventType', 'track.updated',
        'eventId', v_event_id,
        'deviceId', p_device_id,
        'messageId', v_message_id,
        'cursor', jsonb_build_object(
          'rbLocalUsn', nullif(v_change->>'rbLocalUsn','')::bigint,
          'id', v_change->>'id'
        ),
        'data', jsonb_build_object(
          'trackId', v_change->>'id',
          'trackHash', v_change->>'hash'
        )
      )
    );
  end loop;

  -- Deleted tracks.
  for v_change in
    select value
    from jsonb_array_elements(
      coalesce(
        p_envelope #> '{changes,deleted}',
        '[]'::jsonb
      )
    ) as value
  loop
    insert into public.sync_changes(
      message_id,
      device_id,
      action,
      track_id,
      track_uuid,
      track_hash,
      rb_local_usn,
      updated_at,
      track
    )
    values(
      v_message_id,
      p_device_id,
      'delete',
      v_change->>'id',
      v_change->>'uuid',
      v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      null
    );

    perform public.apply_sync_track_change(
      p_device_id,
      'delete',
      v_change->>'id',
      v_change->>'uuid',
      v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      null
    );

    v_event_id := gen_random_uuid();

    insert into public.sync_events(
      event_id,
      device_id,
      message_id,
      event_type,
      aggregate_id,
      rb_local_usn,
      cursor_id,
      occurred_at,
      payload
    )
    values (
      v_event_id,
      p_device_id,
      v_message_id,
      'track.deleted',
      v_change->>'id',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      v_after_id,
      coalesce(
        nullif(v_change->>'updatedAt','')::timestamptz,
        v_received_at
      ),
      jsonb_build_object(
        'schemaVersion', 1,
        'eventType', 'track.deleted',
        'eventId', v_event_id,
        'deviceId', p_device_id,
        'messageId', v_message_id,
        'cursor', jsonb_build_object(
          'rbLocalUsn', nullif(v_change->>'rbLocalUsn','')::bigint,
          'id', v_change->>'id'
        ),
        'data', jsonb_build_object(
          'trackId', v_change->>'id',
          'trackHash', v_change->>'hash'
        )
      )
    );
  end loop;

  -- Advance the cursor only after all state + event writes succeeded.
  insert into public.sync_cursors(
    device_id,
    rb_local_usn,
    cursor_id,
    updated_at
  )
  values(
    p_device_id,
    v_after_usn,
    v_after_id,
    v_received_at
  )
  on conflict(device_id)
  do update set
    rb_local_usn = excluded.rb_local_usn,
    cursor_id = excluded.cursor_id,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'schemaVersion', 1,
    'accepted', true,
    'duplicate', false,
    'idempotencyKey', v_idempotency_key,
    'messageId', v_message_id,
    'receivedAt', v_received_at,
    'cursor', jsonb_build_object(
      'before', case
        when v_before_usn is null then null
        else jsonb_build_object(
          'rbLocalUsn', v_before_usn,
          'id', v_before_id
        )
      end,
      'after', case
        when v_after_usn is null then null
        else jsonb_build_object(
          'rbLocalUsn', v_after_usn,
          'id', v_after_id
        )
      end,
      'hasMore', v_has_more
    )
  );
end;
$$;

revoke all on function public.ingest_sync_batch(text,jsonb)
  from public, anon, authenticated;

grant execute on function public.ingest_sync_batch(text,jsonb)
  to service_role;
