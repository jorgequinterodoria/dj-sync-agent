create or replace function public.apply_sync_track_change(
  p_device_id text, p_action text, p_track_id text, p_track_uuid text,
  p_track_hash text, p_rb_local_usn bigint, p_updated_at timestamptz,
  p_track jsonb, p_snapshot_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'delete' then
    delete from public.sync_tracks
    where device_id = p_device_id and track_id = p_track_id;
    return;
  end if;

  if p_action not in ('add', 'update') then
    raise exception using errcode='P0001', message='invalid_sync_track_action';
  end if;

  if p_track is null or jsonb_typeof(p_track) <> 'object' then
    raise exception using errcode='P0001', message='track_required_for_projection';
  end if;

  insert into public.sync_tracks(
    device_id, track_id, track_uuid, track_hash, rb_local_usn,
    updated_at, track, snapshot_session_id, received_at
  )
  values (
    p_device_id, p_track_id, p_track_uuid, p_track_hash, p_rb_local_usn,
    p_updated_at, p_track,
    coalesce(
      p_snapshot_session_id,
      (
        select s.session_id
        from public.sync_snapshot_sessions s
        where s.device_id = p_device_id and s.status = 'committed'
        order by s.committed_at desc nulls last
        limit 1
      )
    ),
    now()
  )
  on conflict (device_id, track_id)
  do update set
    track_uuid = excluded.track_uuid,
    track_hash = excluded.track_hash,
    rb_local_usn = excluded.rb_local_usn,
    updated_at = excluded.updated_at,
    track = excluded.track,
    snapshot_session_id = excluded.snapshot_session_id,
    received_at = excluded.received_at;
end;
$$;

revoke all on function public.apply_sync_track_change(text,text,text,text,text,bigint,timestamptz,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.apply_sync_track_change(text,text,text,text,text,bigint,timestamptz,jsonb,uuid)
  to service_role;

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
begin
  if p_device_id is null or length(trim(p_device_id)) = 0 then
    raise exception using errcode='P0001', message='device_id_required';
  end if;

  v_message_id := p_envelope #>> '{message,id}';
  v_idempotency_key := p_envelope #>> '{message,idempotencyKey}';
  v_payload_hash := p_envelope #>> '{integrity,payloadHash}';

  if v_message_id is null or v_idempotency_key is null or v_payload_hash is null then
    raise exception using errcode='P0001', message='invalid_envelope_identity';
  end if;

  select * into v_existing_sync
  from public.sync_idempotency
  where idempotency_key = v_idempotency_key
  for update;

  if found then
    if v_existing_sync.device_id <> p_device_id
       or v_existing_sync.message_id <> v_message_id
       or v_existing_sync.payload_hash <> v_payload_hash then
      raise exception using errcode='P0001', message='idempotency_conflict';
    end if;

    select * into v_existing_batch
    from public.sync_batches where message_id = v_message_id;

    if not found then
      raise exception using errcode='P0001', message='idempotency_state_corrupt';
    end if;

    return jsonb_build_object(
      'schemaVersion',1,'accepted',true,'duplicate',true,
      'idempotencyKey',v_idempotency_key,'messageId',v_message_id,
      'receivedAt',v_existing_batch.received_at,
      'cursor',jsonb_build_object(
        'before',case when v_existing_batch.cursor_before_usn is null then null else jsonb_build_object('rbLocalUsn',v_existing_batch.cursor_before_usn,'id',v_existing_batch.cursor_before_id) end,
        'after',case when v_existing_batch.cursor_after_usn is null then null else jsonb_build_object('rbLocalUsn',v_existing_batch.cursor_after_usn,'id',v_existing_batch.cursor_after_id) end,
        'hasMore',v_existing_batch.has_more
      )
    );
  end if;

  v_before_usn := nullif(p_envelope #>> '{cursor,before,rbLocalUsn}','')::bigint;
  v_before_id := p_envelope #>> '{cursor,before,id}';
  v_after_usn := nullif(p_envelope #>> '{cursor,after,rbLocalUsn}','')::bigint;
  v_after_id := p_envelope #>> '{cursor,after,id}';
  v_has_more := coalesce((p_envelope #>> '{cursor,hasMore}')::boolean,false);
  v_scanned := coalesce((p_envelope #>> '{counts,scanned}')::integer,0);
  v_processed := coalesce((p_envelope #>> '{counts,processed}')::integer,0);
  v_added := coalesce((p_envelope #>> '{counts,changes,added}')::integer,0);
  v_updated := coalesce((p_envelope #>> '{counts,changes,updated}')::integer,0);
  v_deleted := coalesce((p_envelope #>> '{counts,changes,deleted}')::integer,0);
  v_unchanged := coalesce((p_envelope #>> '{counts,changes,unchanged}')::integer,0);

  if v_scanned < 0 or v_processed < 0 or v_added < 0 or v_updated < 0 or v_deleted < 0 or v_unchanged < 0 then
    raise exception using errcode='P0001', message='invalid_counts';
  end if;

  if v_added + v_updated + v_deleted + v_unchanged <> v_processed then
    raise exception using errcode='P0001', message='count_invariant_failed';
  end if;

  insert into public.sync_devices(device_id,last_seen_at)
  values(p_device_id,v_received_at)
  on conflict(device_id) do update set last_seen_at=excluded.last_seen_at;

  select * into v_current_cursor
  from public.sync_cursors where device_id=p_device_id for update;

  if found then
    if v_current_cursor.rb_local_usn is distinct from v_before_usn
       or v_current_cursor.cursor_id is distinct from v_before_id then
      raise exception using errcode='P0001', message='cursor_conflict';
    end if;
  elsif v_before_usn is not null or v_before_id is not null then
    insert into public.sync_cursors(device_id,rb_local_usn,cursor_id,updated_at)
    values(p_device_id,v_before_usn,v_before_id,v_received_at);
  else
    insert into public.sync_cursors(device_id,rb_local_usn,cursor_id,updated_at)
    values(p_device_id,null,null,v_received_at);
  end if;

  insert into public.sync_batches(
    message_id,idempotency_key,device_id,payload_hash,received_at,
    cursor_before_usn,cursor_before_id,cursor_after_usn,cursor_after_id,
    has_more,scanned,processed,added,updated,deleted,unchanged,envelope
  )
  values(
    v_message_id,v_idempotency_key,p_device_id,v_payload_hash,v_received_at,
    v_before_usn,v_before_id,v_after_usn,v_after_id,v_has_more,
    v_scanned,v_processed,v_added,v_updated,v_deleted,v_unchanged,p_envelope
  );

  insert into public.sync_idempotency(idempotency_key,device_id,message_id,payload_hash)
  values(v_idempotency_key,p_device_id,v_message_id,v_payload_hash);

  for v_change in
    select value from jsonb_array_elements(coalesce(p_envelope #> '{changes,added}','[]'::jsonb)) as value
  loop
    insert into public.sync_changes(
      message_id,device_id,action,track_id,track_uuid,track_hash,rb_local_usn,updated_at,track
    )
    values(
      v_message_id,p_device_id,'add',v_change->>'id',v_change->>'uuid',v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );
    perform public.apply_sync_track_change(
      p_device_id,'add',v_change->>'id',v_change->>'uuid',v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );
  end loop;

  for v_change in
    select value from jsonb_array_elements(coalesce(p_envelope #> '{changes,updated}','[]'::jsonb)) as value
  loop
    insert into public.sync_changes(
      message_id,device_id,action,track_id,track_uuid,track_hash,rb_local_usn,updated_at,track
    )
    values(
      v_message_id,p_device_id,'update',v_change->>'id',v_change->>'uuid',v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );
    perform public.apply_sync_track_change(
      p_device_id,'update',v_change->>'id',v_change->>'uuid',v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      v_change->'track'
    );
  end loop;

  for v_change in
    select value from jsonb_array_elements(coalesce(p_envelope #> '{changes,deleted}','[]'::jsonb)) as value
  loop
    insert into public.sync_changes(
      message_id,device_id,action,track_id,track_uuid,track_hash,rb_local_usn,updated_at,track
    )
    values(
      v_message_id,p_device_id,'delete',v_change->>'id',v_change->>'uuid',v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      null
    );
    perform public.apply_sync_track_change(
      p_device_id,'delete',v_change->>'id',v_change->>'uuid',v_change->>'hash',
      nullif(v_change->>'rbLocalUsn','')::bigint,
      nullif(v_change->>'updatedAt','')::timestamptz,
      null
    );
  end loop;

  insert into public.sync_cursors(device_id,rb_local_usn,cursor_id,updated_at)
  values(p_device_id,v_after_usn,v_after_id,v_received_at)
  on conflict(device_id) do update set
    rb_local_usn=excluded.rb_local_usn,
    cursor_id=excluded.cursor_id,
    updated_at=excluded.updated_at;

  return jsonb_build_object(
    'schemaVersion',1,'accepted',true,'duplicate',false,
    'idempotencyKey',v_idempotency_key,'messageId',v_message_id,
    'receivedAt',v_received_at,
    'cursor',jsonb_build_object(
      'before',case when v_before_usn is null then null else jsonb_build_object('rbLocalUsn',v_before_usn,'id',v_before_id) end,
      'after',case when v_after_usn is null then null else jsonb_build_object('rbLocalUsn',v_after_usn,'id',v_after_id) end,
      'hasMore',v_has_more
    )
  );
end;
$$;

revoke all on function public.ingest_sync_batch(text,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_sync_batch(text,jsonb) to service_role;

create or replace function public.reconcile_sync_tracks_from_changes(
  p_device_id text,
  p_after_rb_local_usn bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change record;
  v_applied integer := 0;
  v_deleted integer := 0;
  v_upserted integer := 0;
begin
  for v_change in
    select c.action,c.track_id,c.track_uuid,c.track_hash,c.rb_local_usn,c.updated_at,c.track
    from public.sync_changes c
    where c.device_id=p_device_id and c.rb_local_usn>p_after_rb_local_usn
    order by c.rb_local_usn,c.action,c.track_id
  loop
    perform public.apply_sync_track_change(
      p_device_id,v_change.action,v_change.track_id,v_change.track_uuid,
      v_change.track_hash,v_change.rb_local_usn,v_change.updated_at,v_change.track
    );
    v_applied:=v_applied+1;
    if v_change.action='delete' then
      v_deleted:=v_deleted+1;
    else
      v_upserted:=v_upserted+1;
    end if;
  end loop;

  return jsonb_build_object(
    'schemaVersion',1,'deviceId',p_device_id,
    'afterRbLocalUsn',p_after_rb_local_usn,
    'applied',v_applied,'upserted',v_upserted,'deleted',v_deleted
  );
end;
$$;

revoke all on function public.reconcile_sync_tracks_from_changes(text,bigint)
  from public,anon,authenticated;
grant execute on function public.reconcile_sync_tracks_from_changes(text,bigint)
  to service_role;
