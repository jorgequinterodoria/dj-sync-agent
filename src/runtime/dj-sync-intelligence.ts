import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  NormalizedTrack,
} from '../rekordbox/normalized-track.js';

import type {
  RekordboxLibraryService,
} from './rekordbox-library.js';

const execFileAsync =
  promisify(execFile);

export type IntelligenceAnalysisStatus =
  | 'baseline_ready'
  | 'queued_for_ai'
  | 'analyzed'
  | 'failed'
  | 'retired';

export type IntelligenceJobType =
  | 'track.intelligence.refresh'
  | 'track.intelligence.retire'
  | 'track.preference.update';

export type IntelligenceJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TrackIntelligence {
  id: number;

  deviceId: string;

  trackId: string;

  trackUuid:
    | string
    | null;

  trackHash:
    | string
    | null;

  title:
    | string
    | null;

  artist:
    | string
    | null;

  album:
    | string
    | null;

  genre:
    | string
    | null;

  key:
    | string
    | null;

  bpm:
    | number
    | null;

  lengthSeconds:
    | number
    | null;

  bitrate:
    | number
    | null;

  sampleRate:
    | number
    | null;

  rating:
    | number
    | null;

  playCount:
    | number
    | null;

  analysisStatus:
    IntelligenceAnalysisStatus;

  analysisVersion:
    number;

  sourceEventId:
    | string
    | null;

  sourceRbLocalUsn:
    | number
    | null;

  analyzedAt:
    | string
    | null;

  isDeleted:
    boolean;

  createdAt: string;

  updatedAt: string;
}

export interface LatestAnalysis {
  analysisRunId:
    number
    | null;

  deviceId:
    string
    | null;

  trackId:
    string
    | null;

  sourceEventId:
    string
    | null;

  sourceRbLocalUsn:
    number
    | null;

  trackHash:
    string
    | null;

  analysisVersion:
    number
    | null;

  pipelineVersion:
    string
    | null;

  executionContext:
    string
    | null;

  status:
    string
    | null;

  startedAt:
    string
    | null;

  completedAt:
    string
    | null;

  lastError:
    string
    | null;

  createdAt:
    string
    | null;

  updatedAt:
    string
    | null;
}

export interface LatestFeature {
  deviceId:
    string
    | null;

  trackId:
    string
    | null;

  analysisRunId:
    number
    | null;

  featureGroup:
    string
    | null;

  featureKey:
    string
    | null;

  numericValue:
    number
    | null;

  textValue:
    string
    | null;

  booleanValue:
    boolean
    | null;

  jsonValue:
    unknown
    | null;

  unit:
    string
    | null;

  source:
    string
    | null;

  confidence:
    number
    | null;

  createdAt:
    string
    | null;
}

export interface IntelligenceJob {
  id: number;

  jobKey: string;

  /*
   * Jobs are durable historical records.
   * Unknown/future job types must remain readable.
   */
  jobType: string;

  status:
    IntelligenceJobStatus;

  priority: number;

  eventId: string;

  deviceId: string;

  trackId: string;

  rbLocalUsn:
    number
    | null;

  attempts: number;

  availableAt: string;

  lockedAt:
    string
    | null;

  startedAt:
    string
    | null;

  completedAt:
    string
    | null;

  lastError:
    string
    | null;

  createdAt: string;

  updatedAt: string;
}

export interface DJSyncIntelligenceSnapshot {
  schemaVersion: 1;

  generatedAt: string;

  deviceId: string;

  trackId: string;

  intelligence:
    TrackIntelligence
    | null;

  latestAnalysis:
    LatestAnalysis;

  latestFeatures:
    LatestFeature[];

  jobs:
    IntelligenceJob[];
}

export interface DJSyncIntelligenceService {
  get(
    trackId: string,
  ):
    Promise<
      DJSyncIntelligenceSnapshot
    >;

  enqueueRefresh(
    trackId: string,
  ):
    Promise<IntelligenceJob>;

  enqueuePreferenceUpdate(
    trackId: string,
  ):
    Promise<IntelligenceJob>;

  enqueueRetire(
    trackId: string,
  ):
    Promise<IntelligenceJob>;
}

interface IntelligenceRepository {
  getSnapshot(
    deviceId: string,
    trackId: string,
  ):
    Promise<{
      intelligence:
        TrackIntelligence
        | null;

      latestAnalysis:
        LatestAnalysis;

      latestFeatures:
        LatestFeature[];

      jobs:
        IntelligenceJob[];
    }>;

  insertJob(
    input: InsertJobInput,
  ):
    Promise<IntelligenceJob>;
}

interface InsertJobInput {
  jobKey: string;

  jobType:
    IntelligenceJobType;

  priority: number;

  eventId: string;

  deviceId: string;

  trackId: string;

  rbLocalUsn:
    number
    | null;

  payload: unknown;
}

function sqlLiteral(
  value: string,
): string {
  return `'${value.replaceAll(
    "'",
    "''",
  )}'`;
}

async function runSql(
  sql: string,
): Promise<string> {
  const {
    stdout,
    stderr,
  } =
    await execFileAsync(
      'pnpm',
      [
        'supabase',
        'db',
        'query',
        '--linked',
        sql,
      ],
      {
        maxBuffer:
          32 * 1024 * 1024,
      },
    );

  if (
    stderr.trim()
  ) {
    console.error(
      stderr.trim(),
    );
  }

  return stdout;
}

function extractTaggedHex(
  output: string,
  tag: string,
): string | null {
  const marker =
    `${tag}:`;

  const markerIndex =
    output.indexOf(
      marker,
    );

  if (
    markerIndex ===
    -1
  ) {
    return null;
  }

  const remainder =
    output.slice(
      markerIndex +
        marker.length,
    );

  const match =
    remainder.match(
      /^[0-9a-fA-F\s]+/,
    );

  if (
    !match
  ) {
    return null;
  }

  return match[0]
    .replace(
      /\s+/g,
      '',
    );
}

function decodeHexJson(
  hex: string,
): unknown {
  if (
    hex.length ===
      0 ||
    hex.length % 2 !==
      0
  ) {
    throw new Error(
      'Invalid hexadecimal JSON payload returned by Supabase.',
    );
  }

  try {
    const json =
      Buffer.from(
        hex,
        'hex',
      ).toString(
        'utf8',
      );

    return JSON.parse(
      json,
    );
  } catch (
    error
  ) {
    throw new Error(
      [
        'Failed to decode Supabase JSON result.',
        error instanceof Error
          ? error.message
          : String(error),
      ].join(' '),
    );
  }
}

function extractJsonResult(
  output: string,
): unknown | null {
  const hex =
    extractTaggedHex(
      output,
      'RESULT_JSON_HEX',
    );

  if (
    !hex
  ) {
    return null;
  }

  return decodeHexJson(
    hex,
  );
}

function extractJobResult(
  output: string,
):
  IntelligenceJob | null {
  const value =
    extractJsonResult(
      output,
    );

  if (
    value ===
      null ||
    typeof value !==
      'object'
  ) {
    return null;
  }

  return parseJob(
    value as Record<
      string,
      unknown
    >,
  );
}

function asNullableString(
  value: unknown,
):
  string | null {
  return typeof value ===
    'string'
    ? value
    : null;
}

function asNullableNumber(
  value: unknown,
):
  number | null {
  if (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
  ) {
    return value;
  }

  return null;
}

function parseIntelligence(
  value:
    Record<
      string,
      unknown
    >,
):
  TrackIntelligence {
  const analysisStatus =
    value.analysis_status;

  if (
    analysisStatus !==
      'baseline_ready' &&
    analysisStatus !==
      'queued_for_ai' &&
    analysisStatus !==
      'analyzed' &&
    analysisStatus !==
      'failed' &&
    analysisStatus !==
      'retired'
  ) {
    throw new Error(
      [
        'Invalid intelligence analysis status returned by Supabase.',
        `Value: ${String(
          analysisStatus,
        )}.`,
      ].join(' '),
    );
  }

  return {
    id:
      Number(
        value.id,
      ),

    deviceId:
      String(
        value.device_id,
      ),

    trackId:
      String(
        value.track_id,
      ),

    trackUuid:
      asNullableString(
        value.track_uuid,
      ),

    trackHash:
      asNullableString(
        value.track_hash,
      ),

    title:
      asNullableString(
        value.title,
      ),

    artist:
      asNullableString(
        value.artist,
      ),

    album:
      asNullableString(
        value.album,
      ),

    genre:
      asNullableString(
        value.genre,
      ),

    key:
      asNullableString(
        value.key,
      ),

    bpm:
      asNullableNumber(
        value.bpm,
      ),

    lengthSeconds:
      asNullableNumber(
        value.length_seconds,
      ),

    bitrate:
      asNullableNumber(
        value.bitrate,
      ),

    sampleRate:
      asNullableNumber(
        value.sample_rate,
      ),

    rating:
      asNullableNumber(
        value.rating,
      ),

    playCount:
      asNullableNumber(
        value.play_count,
      ),

    analysisStatus:
      analysisStatus,

    analysisVersion:
      Number(
        value.analysis_version,
      ),

    sourceEventId:
      asNullableString(
        value.source_event_id,
      ),

    sourceRbLocalUsn:
      asNullableNumber(
        value.source_rb_local_usn,
      ),

    analyzedAt:
      asNullableString(
        value.analyzed_at,
      ),

    isDeleted:
      value.is_deleted ===
      true,

    createdAt:
      String(
        value.created_at,
      ),

    updatedAt:
      String(
        value.updated_at,
      ),
  };
}

function emptyLatestAnalysis():
  LatestAnalysis {
  return {
    analysisRunId:
      null,

    deviceId:
      null,

    trackId:
      null,

    sourceEventId:
      null,

    sourceRbLocalUsn:
      null,

    trackHash:
      null,

    analysisVersion:
      null,

    pipelineVersion:
      null,

    executionContext:
      null,

    status:
      null,

    startedAt:
      null,

    completedAt:
      null,

    lastError:
      null,

    createdAt:
      null,

    updatedAt:
      null,
  };
}

function parseLatestAnalysis(
  value: unknown,
):
  LatestAnalysis {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return emptyLatestAnalysis();
  }

  const row =
    value as Record<
      string,
      unknown
    >;

  return {
    analysisRunId:
      asNullableNumber(
        row.analysis_run_id,
      ),

    deviceId:
      asNullableString(
        row.device_id,
      ),

    trackId:
      asNullableString(
        row.track_id,
      ),

    sourceEventId:
      asNullableString(
        row.source_event_id,
      ),

    sourceRbLocalUsn:
      asNullableNumber(
        row.source_rb_local_usn,
      ),

    trackHash:
      asNullableString(
        row.track_hash,
      ),

    analysisVersion:
      asNullableNumber(
        row.analysis_version,
      ),

    pipelineVersion:
      asNullableString(
        row.pipeline_version,
      ),

    executionContext:
      asNullableString(
        row.execution_context,
      ),

    status:
      asNullableString(
        row.status,
      ),

    startedAt:
      asNullableString(
        row.started_at,
      ),

    completedAt:
      asNullableString(
        row.completed_at,
      ),

    lastError:
      asNullableString(
        row.last_error,
      ),

    createdAt:
      asNullableString(
        row.created_at,
      ),

    updatedAt:
      asNullableString(
        row.updated_at,
      ),
  };
}

function parseFeature(
  value:
    Record<
      string,
      unknown
    >,
):
  LatestFeature {
  return {
    deviceId:
      asNullableString(
        value.device_id,
      ),

    trackId:
      asNullableString(
        value.track_id,
      ),

    analysisRunId:
      asNullableNumber(
        value.analysis_run_id,
      ),

    featureGroup:
      asNullableString(
        value.feature_group,
      ),

    featureKey:
      asNullableString(
        value.feature_key,
      ),

    numericValue:
      asNullableNumber(
        value.numeric_value,
      ),

    textValue:
      asNullableString(
        value.text_value,
      ),

    booleanValue:
      value.boolean_value ===
        true ||
      value.boolean_value ===
        false
        ? value.boolean_value
        : null,

    jsonValue:
      value.json_value ??
      null,

    unit:
      asNullableString(
        value.unit,
      ),

    source:
      asNullableString(
        value.source,
      ),

    confidence:
      asNullableNumber(
        value.confidence,
      ),

    createdAt:
      asNullableString(
        value.created_at,
      ),
  };
}

function parseJob(
  value:
    Record<
      string,
      unknown
    >,
):
  IntelligenceJob {
  const status =
    value.status;

  if (
    status !==
      'pending' &&
    status !==
      'running' &&
    status !==
      'completed' &&
    status !==
      'failed' &&
    status !==
      'cancelled'
  ) {
    throw new Error(
      [
        'Invalid intelligence job status returned by Supabase.',
        `Value: ${String(
          status,
        )}.`,
      ].join(' '),
    );
  }

  return {
    id:
      Number(
        value.id,
      ),

    jobKey:
      String(
        value.job_key,
      ),

    /*
     * Unknown/future job types remain readable.
     * Only job creation is restricted to known
     * application-managed job types.
     */
    jobType:
      String(
        value.job_type,
      ),

    status,

    priority:
      Number(
        value.priority,
      ),

    eventId:
      String(
        value.event_id,
      ),

    deviceId:
      String(
        value.device_id,
      ),

    trackId:
      String(
        value.track_id,
      ),

    rbLocalUsn:
      asNullableNumber(
        value.rb_local_usn,
      ),

    attempts:
      Number(
        value.attempts,
      ),

    availableAt:
      String(
        value.available_at,
      ),

    lockedAt:
      asNullableString(
        value.locked_at,
      ),

    startedAt:
      asNullableString(
        value.started_at,
      ),

    completedAt:
      asNullableString(
        value.completed_at,
      ),

    lastError:
      asNullableString(
        value.last_error,
      ),

    createdAt:
      String(
        value.created_at,
      ),

    updatedAt:
      String(
        value.updated_at,
      ),
  };
}

function mapTrackSnapshot(
  track: NormalizedTrack,
  intelligence:
    TrackIntelligence
    | null,
  trackHash:
    string | null,
):
  Record<
    string,
    unknown
  > {
  return {
    trackUuid:
      track.identity.uuid,

    trackHash,

    title:
      track.metadata.title,

    artist:
      track.metadata.artist,

    album:
      track.metadata.album,

    genre:
      track.metadata.genre,

    key:
      track.metadata.key,

    remixer:
      track.metadata.remixer,

    bpm:
      track.technical.bpm,

    rating:
      track.technical.rating,

    lengthSeconds:
      track.technical.lengthSeconds,

    bitrate:
      track.technical.bitrate,

    sampleRate:
      track.technical.sampleRate,

    playCount:
      track.technical.playCount,
  };
}

function mapTrackSnapshotFromIntelligence(
  intelligence:
    TrackIntelligence,
):
  Record<
    string,
    unknown
  > {
  return {
    trackUuid:
      intelligence.trackUuid,

    trackHash:
      intelligence.trackHash,

    title:
      intelligence.title,

    artist:
      intelligence.artist,

    album:
      intelligence.album,

    genre:
      intelligence.genre,

    key:
      intelligence.key,

    remixer:
      null,

    bpm:
      intelligence.bpm,

    rating:
      intelligence.rating,

    lengthSeconds:
      intelligence.lengthSeconds,

    bitrate:
      intelligence.bitrate,

    sampleRate:
      intelligence.sampleRate,

    playCount:
      intelligence.playCount,
  };
}

class SupabaseIntelligenceRepository
  implements
    IntelligenceRepository
{
  public async getSnapshot(
    deviceId: string,
    trackId: string,
  ):
    Promise<{
      intelligence:
        TrackIntelligence
        | null;

      latestAnalysis:
        LatestAnalysis;

      latestFeatures:
        LatestFeature[];

      jobs:
        IntelligenceJob[];
    }> {
    const sql = `
select
  'RESULT_JSON_HEX:' ||
  encode(
    convert_to(
      json_build_object(
        'intelligence',
        (
          select row_to_json(i)
          from (
            select
              id,
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
            from public.dj_track_intelligence
            where device_id =
                  ${sqlLiteral(deviceId)}
              and track_id =
                  ${sqlLiteral(trackId)}
            limit 1
          ) i
        ),

        'latestAnalysis',
        coalesce(
          (
            select row_to_json(a)
            from (
              select
                analysis_run_id,
                device_id,
                track_id,
                source_event_id,
                source_rb_local_usn,
                track_hash,
                analysis_version,
                pipeline_version,
                execution_context,
                status,
                started_at,
                completed_at,
                last_error,
                created_at,
                updated_at
              from public.dj_track_latest_analysis
              where device_id =
                    ${sqlLiteral(deviceId)}
                and track_id =
                    ${sqlLiteral(trackId)}
              limit 1
            ) a
          ),
          '{}'::json
        ),

        'latestFeatures',
        coalesce(
          (
            select json_agg(
              row_to_json(f)
              order by
                f.created_at desc
            )
            from (
              select
                device_id,
                track_id,
                analysis_run_id,
                feature_group,
                feature_key,
                numeric_value,
                text_value,
                boolean_value,
                json_value,
                unit,
                source,
                confidence,
                created_at
              from public.dj_track_latest_features
              where device_id =
                    ${sqlLiteral(deviceId)}
                and track_id =
                    ${sqlLiteral(trackId)}
            ) f
          ),
          '[]'::json
        ),

        'jobs',
        coalesce(
          (
            select json_agg(
              row_to_json(j)
              order by
                j.created_at desc
            )
            from (
              select
                id,
                job_key,
                job_type,
                status,
                priority,
                event_id,
                device_id,
                track_id,
                rb_local_usn,
                attempts,
                available_at,
                locked_at,
                started_at,
                completed_at,
                last_error,
                created_at,
                updated_at
              from public.dj_intelligence_jobs
              where device_id =
                    ${sqlLiteral(deviceId)}
                and track_id =
                    ${sqlLiteral(trackId)}
            ) j
          ),
          '[]'::json
        )
      )::text,
      'utf8'
    ),
    'hex'
  ) as result;
`;

    const output =
      await runSql(
        sql,
      );

    const value =
      extractJsonResult(
        output,
      );

    if (
      value === null ||
      typeof value !==
        'object'
    ) {
      return {
        intelligence:
          null,

        latestAnalysis:
          emptyLatestAnalysis(),

        latestFeatures:
          [],

        jobs:
          [],
      };
    }

    const root =
      value as Record<
        string,
        unknown
      >;

    let intelligence:
      TrackIntelligence
      | null =
      null;

    if (
      root.intelligence &&
      typeof root.intelligence ===
        'object'
    ) {
      intelligence =
        parseIntelligence(
          root.intelligence as Record<
            string,
            unknown
          >,
        );
    }

    const latestFeatures =
      Array.isArray(
        root.latestFeatures,
      )
        ? root.latestFeatures
            .filter(
              (
                feature,
              ) =>
                feature !==
                  null &&
                typeof feature ===
                  'object',
            )
            .map(
              (
                feature,
              ) =>
                parseFeature(
                  feature as Record<
                    string,
                    unknown
                  >,
                ),
            )
        : [];

    const jobs =
      Array.isArray(
        root.jobs,
      )
        ? root.jobs
            .filter(
              (
                job,
              ) =>
                job !==
                  null &&
                typeof job ===
                  'object',
            )
            .map(
              (
                job,
              ) =>
                parseJob(
                  job as Record<
                    string,
                    unknown
                  >,
                ),
            )
        : [];

    return {
      intelligence,

      latestAnalysis:
        parseLatestAnalysis(
          root.latestAnalysis,
        ),

      latestFeatures,

      jobs,
    };
  }

  public async insertJob(
    input: InsertJobInput,
  ):
    Promise<IntelligenceJob> {
    const payloadJson =
      JSON.stringify(
        input.payload,
      );

    const sql = `
insert into public.dj_intelligence_jobs (
  job_key,
  job_type,
  priority,
  event_id,
  device_id,
  track_id,
  rb_local_usn,
  payload
)
values (
  ${sqlLiteral(input.jobKey)},
  ${sqlLiteral(input.jobType)},
  ${input.priority},
  ${sqlLiteral(input.eventId)}::uuid,
  ${sqlLiteral(input.deviceId)},
  ${sqlLiteral(input.trackId)},
  ${
    input.rbLocalUsn === null
      ? 'null'
      : String(
          input.rbLocalUsn,
        )
  },
  ${sqlLiteral(
    payloadJson,
  )}::jsonb
)
on conflict (job_key)
do update set
  updated_at =
    public.dj_intelligence_jobs.updated_at
returning
  'RESULT_JOB_HEX:' ||
  encode(
    convert_to(
      json_build_object(
        'id', id,
        'job_key', job_key,
        'job_type', job_type,
        'status', status,
        'priority', priority,
        'event_id', event_id,
        'device_id', device_id,
        'track_id', track_id,
        'rb_local_usn', rb_local_usn,
        'attempts', attempts,
        'available_at', available_at,
        'locked_at', locked_at,
        'started_at', started_at,
        'completed_at', completed_at,
        'last_error', last_error,
        'created_at', created_at,
        'updated_at', updated_at
      )::text,
      'utf8'
    ),
    'hex'
  ) as result;
`;

    const output =
      await runSql(
        sql,
      );

    const job =
      extractJobResult(
        output.replace(
          'RESULT_JOB_HEX:',
          'RESULT_JSON_HEX:',
        ),
      );

    if (
      job === null
    ) {
      throw new Error(
        [
          'Supabase did not return the intelligence job.',
          `Job key: ${input.jobKey}.`,
        ].join(' '),
      );
    }

    return job;
  }
}

function buildRefreshJob(
  deviceId: string,
  track: NormalizedTrack,
  intelligence:
    TrackIntelligence
    | null,
  latestAnalysis:
    LatestAnalysis,
):
  InsertJobInput {
  const eventId =
    randomUUID();

  /*
   * The latest completed analysis is the authoritative
   * analysis identity for an Intelligence refresh.
   *
   * Only fall back to the intelligence projection when
   * the latest-analysis projection has no hash yet.
   */
  const trackHash =
    latestAnalysis.trackHash ??
    intelligence?.trackHash ??
    null;

  const rbLocalUsn =
    latestAnalysis.sourceRbLocalUsn ??
    track.sync.rbLocalUsn ??
    intelligence?.sourceRbLocalUsn ??
    null;

  const jobKey =
    [
      deviceId,
      track.identity.id,
      'track.intelligence.refresh',
      trackHash ??
        rbLocalUsn ??
        eventId,
    ].join(':');

  return {
    jobKey,

    jobType:
      'track.intelligence.refresh',

    priority:
      50,

    eventId,

    deviceId,

    trackId:
      track.identity.id,

    rbLocalUsn,

    payload: {
      schemaVersion: 1,

      eventId,

      eventType:
        'desktop.intelligence.refresh',

      deviceId,

      trackId:
        track.identity.id,

      trackUuid:
        track.identity.uuid,

      trackHash,

      rbLocalUsn,

      changedFields: [],

      changeDetails: {},

      currentState:
        mapTrackSnapshot(
          track,
          intelligence,
          trackHash,
        ),

      previousState:
        intelligence ===
          null
          ? null
          : mapTrackSnapshotFromIntelligence(
              intelligence,
            ),

      analysisContext: {
        analysisRunId:
          latestAnalysis.analysisRunId,

        analysisVersion:
          latestAnalysis.analysisVersion,

        pipelineVersion:
          latestAnalysis.pipelineVersion,

        status:
          latestAnalysis.status,

        completedAt:
          latestAnalysis.completedAt,
      },

      reason:
        'manual_desktop_refresh',
    },
  };
}

function buildPreferenceJob(
  deviceId: string,
  track: NormalizedTrack,
  intelligence:
    TrackIntelligence
    | null,
  latestAnalysis:
    LatestAnalysis,
):
  InsertJobInput {
  const eventId =
    randomUUID();

  const rbLocalUsn =
    latestAnalysis.sourceRbLocalUsn ??
    track.sync.rbLocalUsn ??
    intelligence?.sourceRbLocalUsn ??
    null;

  const jobKey =
    [
      deviceId,
      track.identity.id,
      'track.preference.update',
      eventId,
    ].join(':');

  return {
    jobKey,

    jobType:
      'track.preference.update',

    priority:
      40,

    eventId,

    deviceId,

    trackId:
      track.identity.id,

    rbLocalUsn,

    payload: {
      schemaVersion: 1,

      eventId,

      eventType:
        'desktop.preference.update',

      deviceId,

      trackId:
        track.identity.id,

      trackUuid:
        track.identity.uuid,

      trackHash:
        latestAnalysis.trackHash ??
        intelligence?.trackHash ??
        null,

      rbLocalUsn,

      changedFields: [
        'rating',
        'playCount',
      ],

      currentState: {
        rating:
          track.technical.rating,

        playCount:
          track.technical.playCount,
      },

      previousState:
        intelligence ===
          null
          ? null
          : {
              rating:
                intelligence.rating,

              playCount:
                intelligence.playCount,
            },

      analysisContext: {
        analysisRunId:
          latestAnalysis.analysisRunId,

        analysisVersion:
          latestAnalysis.analysisVersion,

        pipelineVersion:
          latestAnalysis.pipelineVersion,

        status:
          latestAnalysis.status,

        completedAt:
          latestAnalysis.completedAt,
      },

      reason:
        'manual_desktop_preference_update',

      ratingChanged:
        true,

      playCountChanged:
        true,
    },
  };
}

function buildRetireJob(
  deviceId: string,
  track: NormalizedTrack,
  intelligence:
    TrackIntelligence
    | null,
  latestAnalysis:
    LatestAnalysis,
):
  InsertJobInput {
  const eventId =
    randomUUID();

  const rbLocalUsn =
    latestAnalysis.sourceRbLocalUsn ??
    track.sync.rbLocalUsn ??
    intelligence?.sourceRbLocalUsn ??
    null;

  const jobKey =
    [
      deviceId,
      track.identity.id,
      'track.intelligence.retire',
      rbLocalUsn ??
        eventId,
    ].join(':');

  return {
    jobKey,

    jobType:
      'track.intelligence.retire',

    priority:
      70,

    eventId,

    deviceId,

    trackId:
      track.identity.id,

    rbLocalUsn,

    payload: {
      schemaVersion: 1,

      eventId,

      eventType:
        'desktop.intelligence.retire',

      deviceId,

      trackId:
        track.identity.id,

      trackUuid:
        track.identity.uuid,

      trackHash:
        latestAnalysis.trackHash ??
        intelligence?.trackHash ??
        null,

      rbLocalUsn,

      title:
        track.metadata.title,

      artist:
        track.metadata.artist,

      album:
        track.metadata.album,

      genre:
        track.metadata.genre,

      key:
        track.metadata.key,

      remixer:
        track.metadata.remixer,

      bpm:
        track.technical.bpm,

      rating:
        track.technical.rating,

      lengthSeconds:
        track.technical.lengthSeconds,

      bitrate:
        track.technical.bitrate,

      sampleRate:
        track.technical.sampleRate,

      playCount:
        track.technical.playCount,

      analysisContext: {
        analysisRunId:
          latestAnalysis.analysisRunId,

        analysisVersion:
          latestAnalysis.analysisVersion,

        pipelineVersion:
          latestAnalysis.pipelineVersion,

        status:
          latestAnalysis.status,

        completedAt:
          latestAnalysis.completedAt,
      },

      reason:
        'track_deleted',
    },
  };
}

export function createDJSyncIntelligenceService(
  options: {
    deviceId: string;

    library:
      Pick<
        RekordboxLibraryService,
        'getById'
      >;

    repository:
      IntelligenceRepository;
  },
):
  DJSyncIntelligenceService {
  const deviceId =
    options.deviceId.trim();

  if (
    !deviceId
  ) {
    throw new Error(
      'SYNC_AGENT_ID is required.',
    );
  }

  async function resolveTrack(
    trackId: string,
  ):
    Promise<NormalizedTrack> {
    const normalizedId =
      trackId.trim();

    if (
      !normalizedId
    ) {
      throw new Error(
        'Track ID is required.',
      );
    }

    return options.library.getById(
      normalizedId,
    );
  }

  async function get(
    trackId: string,
  ):
    Promise<
      DJSyncIntelligenceSnapshot
    > {
    const track =
      await resolveTrack(
        trackId,
      );

    const state =
      await options.repository.getSnapshot(
        deviceId,
        track.identity.id,
      );

    return {
      schemaVersion: 1,

      generatedAt:
        new Date().toISOString(),

      deviceId,

      trackId:
        track.identity.id,

      intelligence:
        state.intelligence,

      latestAnalysis:
        state.latestAnalysis,

      latestFeatures:
        state.latestFeatures,

      jobs:
        state.jobs,
    };
  }

  async function enqueue(
    trackId: string,
    builder: (
      track: NormalizedTrack,
      intelligence:
        TrackIntelligence
        | null,
      latestAnalysis:
        LatestAnalysis,
    ) =>
      InsertJobInput,
  ):
    Promise<IntelligenceJob> {
    const track =
      await resolveTrack(
        trackId,
      );

    const state =
      await options.repository.getSnapshot(
        deviceId,
        track.identity.id,
      );

    return options.repository.insertJob(
      builder(
        track,
        state.intelligence,
        state.latestAnalysis,
      ),
    );
  }

  return {
    get,

    enqueueRefresh(
      trackId,
    ) {
      return enqueue(
        trackId,
        buildRefreshJob.bind(
          null,
          deviceId,
        ),
      );
    },

    enqueuePreferenceUpdate(
      trackId,
    ) {
      return enqueue(
        trackId,
        buildPreferenceJob.bind(
          null,
          deviceId,
        ),
      );
    },

    enqueueRetire(
      trackId,
    ) {
      return enqueue(
        trackId,
        buildRetireJob.bind(
          null,
          deviceId,
        ),
      );
    },
  };
}

export function createDefaultDJSyncIntelligenceService(
  library:
    Pick<
      RekordboxLibraryService,
      'getById'
    >,
):
  DJSyncIntelligenceService {
  const deviceId =
    process.env.SYNC_AGENT_ID?.trim() ??
    '';

  if (
    !deviceId
  ) {
    throw new Error(
      'SYNC_AGENT_ID is required.',
    );
  }

  return createDJSyncIntelligenceService({
    deviceId,

    library,

    repository:
      new SupabaseIntelligenceRepository(),
  });
}

export {
  buildPreferenceJob,
  buildRefreshJob,
  buildRetireJob,
  parseFeature,
  parseIntelligence,
  parseJob,
};