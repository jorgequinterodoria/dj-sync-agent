create or replace function public.execute_intelligence_job(
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

  v_current_analysis public.dj_track_analysis_runs%rowtype;

  v_job_hash text;
  v_current_hash text;

  v_track_uuid text;
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

  v_rb_local_usn bigint;

  v_analysis_version integer;
  v_analyzed_at timestamptz;

  v_source_event_id uuid;
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker_id_required';
  end if;

  /*
   * The job must still be owned by the worker that
   * claimed it. The row remains locked for the entire
   * transaction.
   */
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

  v_payload :=
    coalesce(
      v_job.payload,
      '{}'::jsonb
    );

  /*
   * Only Intelligence jobs are handled here.
   */
  if v_job.job_type not in (
    'track.intelligence.refresh',
    'track.preference.update',
    'track.intelligence.retire'
  ) then
    raise exception
      'unsupported_intelligence_job_type:%',
      v_job.job_type;
  end if;

  /*
   * --------------------------------------------------
   * TRACK INTELLIGENCE REFRESH
   * --------------------------------------------------
   */
  if v_job.job_type =
     'track.intelligence.refresh'
  then
    v_job_hash :=
      nullif(
        trim(
          v_payload->>'trackHash'
        ),
        ''
      );

    /*
     * The latest completed analysis is the
     * authoritative source for deterministic
     * Intelligence.
     */
    select r.*
    into v_current_analysis
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

    if not found then
      raise exception
        'no_completed_analysis:%',
        v_job.track_id;
    end if;

    v_current_hash :=
      nullif(
        trim(
          v_current_analysis.track_hash
        ),
        ''
      );

    /*
     * A job created for a previous analysis must
     * never overwrite a newer analysis projection.
     */
    if v_job_hash is not null
       and v_current_hash is not null
       and v_job_hash <>
           v_current_hash
    then
      raise exception
        'stale_intelligence_job:%:%',
        v_job_hash,
        v_current_hash;
    end if;

    v_track_uuid :=
      nullif(
        trim(
          v_payload->>'trackUuid'
        ),
        ''
      );

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
        (
          v_payload
            ->'currentState'
            ->>'bpm'
        ),
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

    v_rb_local_usn :=
      coalesce(
        v_job.rb_local_usn,
        v_current_analysis.source_rb_local_usn
      );

    v_analysis_version :=
      coalesce(
        v_current_analysis.analysis_version,
        1
      );

    v_analyzed_at :=
      coalesce(
        v_current_analysis.completed_at,
        now()
      );

    v_source_event_id :=
      v_job.event_id;

    /*
     * One intelligence projection exists per
     * device + track.
     */
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
      v_track_uuid,
      coalesce(
        v_current_hash,
        v_job_hash
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
      'baseline_ready',
      v_analysis_version,
      v_source_event_id,
      v_rb_local_usn,
      v_analyzed_at,
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

      /*
       * A future analyzed state must never be downgraded
       * back to baseline_ready by a deterministic refresh.
       */
      analysis_status =
        case
          when public.dj_track_intelligence.analysis_status =
               'analyzed'
            then 'analyzed'
          else 'baseline_ready'
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

  /*
   * --------------------------------------------------
   * PREFERENCE UPDATE
   * --------------------------------------------------
   */
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

  /*
   * --------------------------------------------------
   * RETIRE
   * --------------------------------------------------
   */
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
  end if;

  /*
   * Projection and completion happen inside the same
   * database transaction. If anything above raises,
   * PostgreSQL rolls back the projection and the job
   * remains running until the caller handles the failure.
   */
  update public.dj_intelligence_jobs
  set
    status =
      'completed',

    completed_at =
      now(),

    locked_at =
      null,

    locked_by =
      null,

    last_error =
      null,

    updated_at =
      now()
  where id =
        p_job_id
    and status =
        'running'
    and locked_by =
        trim(p_worker_id)
  returning *
  into v_job;

  if not found then
    raise exception
      'job_completion_lease_lost';
  end if;

  return v_job;
end;
$$;

revoke all on function
  public.execute_intelligence_job(
    bigint,
    text
  )
from public;