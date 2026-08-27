create or replace function public.apply_intelligence_job(
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
  v_payload jsonb;

  v_track_hash text;
  v_latest_hash text;

  v_title text;
  v_artist text;
  v_album text;
  v_genre text;
  v_key text;
  v_remixer text;

  v_bpm numeric;
  v_length_seconds integer;
  v_bitrate integer;
  v_sample_rate integer;
  v_rating integer;
  v_play_count integer;

  v_analysis_version integer;
  v_latest_analysis_status text;
  v_latest_analysis_id bigint;
  v_latest_analysis_completed_at timestamptz;

  v_current_usn bigint;

  v_analysis_status text;
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker_id_required';
  end if;

  select *
  into v_job
  from public.dj_intelligence_jobs
  where id = p_job_id
    and status = 'running'
    and locked_by = trim(p_worker_id)
  for update;

  if not found then
    raise exception 'job_lease_not_owned';
  end if;

  /*
   * Re-execution after a worker crash is intentionally
   * idempotent. The projection is derived again from
   * the current authoritative Rekordbox/intelligence
   * state.
   */

  v_payload :=
    coalesce(
      v_job.payload,
      '{}'::jsonb
    );

  if v_job.job_type =
     'track.intelligence.refresh'
  then
    v_track_hash :=
      nullif(
        trim(
          v_payload->>'trackHash'
        ),
        ''
      );

    v_latest_hash :=
      null;

    select
      r.track_hash,
      r.status,
      r.id,
      r.completed_at
    into
      v_latest_hash,
      v_latest_analysis_status,
      v_latest_analysis_id,
      v_latest_analysis_completed_at
    from public.dj_track_analysis_runs r
    where r.device_id =
          v_job.device_id
      and r.track_id =
          v_job.track_id
      and r.status =
          'completed'
    order by
      r.completed_at desc nulls last,
      r.id desc
    limit 1;

    /*
     * A refresh created against a historical snapshot
     * must never overwrite a newer analysis projection.
     */
    if v_track_hash is not null
       and v_latest_hash is not null
       and v_track_hash <>
           v_latest_hash
    then
      raise exception
        'stale_intelligence_job:%:%',
        v_track_hash,
        v_latest_hash;
    end if;

    v_title :=
      nullif(
        trim(
          v_payload
            ->'currentState'
            ->>'title'
        ),
        ''
      );

    v_artist :=
      nullif(
        trim(
          v_payload
            ->'currentState'
            ->>'artist'
        ),
        ''
      );

    v_album :=
      nullif(
        trim(
          v_payload
            ->'currentState'
            ->>'album'
        ),
        ''
      );

    v_genre :=
      nullif(
        trim(
          v_payload
            ->'currentState'
            ->>'genre'
        ),
        ''
      );

    v_key :=
      nullif(
        trim(
          v_payload
            ->'currentState'
            ->>'key'
        ),
        ''
      );

    v_remixer :=
      nullif(
        trim(
          v_payload
            ->'currentState'
            ->>'remixer'
        ),
        ''
      );

    v_bpm :=
      nullif(
        v_payload
          ->'currentState'
          ->>'bpm',
        ''
      )::numeric;

    v_length_seconds :=
      nullif(
        round(
          (
            v_payload
              ->'currentState'
              ->>'lengthSeconds'
          )::numeric
        ),
        null
      )::integer;

    v_bitrate :=
      nullif(
        round(
          (
            v_payload
              ->'currentState'
              ->>'bitrate'
          )::numeric
        ),
        null
      )::integer;

    v_sample_rate :=
      nullif(
        round(
          (
            v_payload
              ->'currentState'
              ->>'sampleRate'
          )::numeric
        ),
        null
      )::integer;

    v_rating :=
      nullif(
        round(
          (
            v_payload
              ->'currentState'
              ->>'rating'
          )::numeric
        ),
        null
      )::integer;

    v_play_count :=
      nullif(
        round(
          (
            v_payload
              ->'currentState'
              ->>'playCount'
          )::numeric
        ),
        null
      )::integer;

    v_current_usn :=
      coalesce(
        v_job.rb_local_usn,
        (
          select max(
            e.rb_local_usn
          )
          from public.dj_sync_events e
          where e.device_id =
                v_job.device_id
            and e.track_id =
                v_job.track_id
        )
      );

    v_analysis_version :=
      coalesce(
        (
          select r.analysis_version
          from public.dj_track_analysis_runs r
          where r.device_id =
                v_job.device_id
            and r.track_id =
                v_job.track_id
            and r.status =
                'completed'
          order by
            r.completed_at desc nulls last,
            r.id desc
          limit 1
        ),
        1
      );

    /*
     * During this foundation phase the refresh handler
     * materializes the deterministic baseline.
     *
     * AI enrichment will later transition this row
     * to queued_for_ai / analyzed.
     */
    v_analysis_status :=
      'baseline_ready';

    insert into public.dj_track_intelligence (
      device_id,
      track_id,
      track_uuid,
      track_hash,
      title,
      artist,
      album,
      genre,
      key,
      bpm,
      length_seconds,
      bitrate,
      sample_rate,
      rating,
      play_count,
      analysis_status,
      analysis_version,
      source_event_id,
      source_rb_local_usn,
      analyzed_at,
      is_deleted,
      created_at,
      updated_at
    )
    values (
      v_job.device_id,
      v_job.track_id,

      nullif(
        trim(
          v_payload->>'trackUuid'
        ),
        ''
      ),

      coalesce(
        v_latest_hash,
        v_track_hash
      ),

      v_title,
      v_artist,
      v_album,
      v_genre,
      v_key,
      v_bpm,
      v_length_seconds,
      v_bitrate,
      v_sample_rate,
      v_rating,
      v_play_count,

      v_analysis_status,
      v_analysis_version,

      v_job.event_id,
      v_current_usn,
      coalesce(
        v_latest_analysis_completed_at,
        now()
      ),

      false,
      now(),
      now()
    )
    on conflict (
      device_id,
      track_id
    )
    do update set
      track_uuid =
        excluded.track_uuid,

      track_hash =
        excluded.track_hash,

      title =
        excluded.title,

      artist =
        excluded.artist,

      album =
        excluded.album,

      genre =
        excluded.genre,

      key =
        excluded.key,

      bpm =
        excluded.bpm,

      length_seconds =
        excluded.length_seconds,

      bitrate =
        excluded.bitrate,

      sample_rate =
        excluded.sample_rate,

      rating =
        excluded.rating,

      play_count =
        excluded.play_count,

      analysis_status =
        case
          when public.dj_track_intelligence.analysis_status =
               'analyzed'
            then 'analyzed'
          else excluded.analysis_status
        end,

      analysis_version =
        excluded.analysis_version,

      source_event_id =
        excluded.source_event_id,

      source_rb_local_usn =
        excluded.source_rb_local_usn,

      analyzed_at =
        excluded.analyzed_at,

      is_deleted =
        false,

      updated_at =
        now();

  elsif v_job.job_type =
        'track.preference.update'
  then
    v_rating :=
      nullif(
        round(
          (
            v_payload
              ->'currentState'
              ->>'rating'
          )::numeric
        ),
        null
      )::integer;

    v_play_count :=
      nullif(
        round(
          (
            v_payload
              ->'currentState'
              ->>'playCount'
          )::numeric
        ),
        null
      )::integer;

    update public.dj_track_intelligence
    set
      rating =
        v_rating,

      play_count =
        v_play_count,

      updated_at =
        now()
    where device_id =
          v_job.device_id
      and track_id =
          v_job.track_id;

  elsif v_job.job_type =
        'track.intelligence.retire'
  then
    update public.dj_track_intelligence
    set
      analysis_status =
        'retired',

      is_deleted =
        true,

      source_event_id =
        v_job.event_id,

      source_rb_local_usn =
        v_job.rb_local_usn,

      updated_at =
        now()
    where device_id =
          v_job.device_id
      and track_id =
          v_job.track_id;

  else
    raise exception
      'unsupported_intelligence_job_type:%',
      v_job.job_type;
  end if;

  return v_job;
end;
$$;

revoke all on function
  public.apply_intelligence_job(
    bigint,
    text
  )
from public;