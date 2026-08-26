import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  AudioAnalysis,
  AudioAnalysisPersistenceResult,
} from './audio-analysis.js';

import type {
  VerifiedAudioAsset,
} from './audio-verifier.js';

const execFileAsync =
  promisify(execFile);

const ANALYSIS_VERSION =
  1;

const PIPELINE_VERSION =
  '3.2';

const STALE_RUN_AFTER_MINUTES =
  30;

const MAX_ACQUIRE_ATTEMPTS =
  3;

const RETRY_DELAY_MS =
  250;

export interface AudioAnalysisRunPersistencePort {
  persistVerifiedAnalysis(
    trackId: string,
    analysis: AudioAnalysis,
    asset: VerifiedAudioAsset,
  ):
    Promise<
      AudioAnalysisPersistenceResult
    >;
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
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
          8 * 1024 * 1024,
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

function parseTaggedId(
  output: string,
  tag: string,
):
  number | null {
  const match =
    output.match(
      new RegExp(
        `${tag}:(\\d+)`,
      ),
    );

  if (
    !match?.[1]
  ) {
    return null;
  }

  const value =
    Number(
      match[1],
    );

  return Number.isSafeInteger(
    value,
  )
    ? value
    : null;
}

async function findTrackHash(
  deviceId: string,
  trackId: string,
  asset: VerifiedAudioAsset,
): Promise<string> {
  const sql = `
select
  'RESULT_TRACK_HASH:' ||
  track_hash as result
from public.dj_track_audio_assets
where device_id =
      ${sqlLiteral(deviceId)}
  and track_id =
      ${sqlLiteral(trackId)}
  and asset_status =
      'verified'
  and audio_checksum =
      ${sqlLiteral(asset.checksum)}
  and file_size =
      ${asset.size}
order by
  updated_at desc
limit 1;
`;

  const output =
    await runSql(
      sql,
    );

  const match =
    output.match(
      /RESULT_TRACK_HASH:([a-fA-F0-9-]{20,})/,
    );

  if (
    !match?.[1]
  ) {
    throw new Error(
      [
        `No verified audio asset mapping found for ${trackId}.`,
        `SHA-256: ${asset.checksum}.`,
      ].join(' '),
    );
  }

  return match[1];
}

async function expireStaleAnalysisRuns(
  deviceId: string,
  trackId: string,
  trackHash: string,
): Promise<void> {
  const sql = `
update public.dj_track_analysis_runs
set
  status =
    'failed',
  completed_at =
    now(),
  updated_at =
    now(),
  last_error =
    'Stale active analysis run superseded by desktop analysis.'
where device_id =
      ${sqlLiteral(deviceId)}
  and track_id =
      ${sqlLiteral(trackId)}
  and coalesce(
    track_hash,
    ''
  ) =
      ${sqlLiteral(trackHash)}
  and analysis_version =
      ${ANALYSIS_VERSION}
  and pipeline_version =
      ${sqlLiteral(PIPELINE_VERSION)}
  and status in (
    'pending',
    'running'
  )
  and started_at is not null
  and started_at <
      now() -
      interval '${STALE_RUN_AFTER_MINUTES} minutes';
`;

  await runSql(
    sql,
  );
}

async function findReusableRun(
  deviceId: string,
  trackId: string,
  trackHash: string,
): Promise<number | null> {
  const sql = `
select
  'RESULT_REUSED:' ||
  id::text as result
from public.dj_track_analysis_runs
where device_id =
      ${sqlLiteral(deviceId)}
  and track_id =
      ${sqlLiteral(trackId)}
  and coalesce(
    track_hash,
    ''
  ) =
      ${sqlLiteral(trackHash)}
  and analysis_version =
      ${ANALYSIS_VERSION}
  and pipeline_version =
      ${sqlLiteral(PIPELINE_VERSION)}
  and status =
      'completed'
order by
  completed_at desc nulls last,
  id desc
limit 1;
`;

  const output =
    await runSql(
      sql,
    );

  return parseTaggedId(
    output,
    'RESULT_REUSED',
  );
}

async function tryCreateAnalysisRun(
  deviceId: string,
  trackId: string,
  trackHash: string,
): Promise<number | null> {
  const sql = `
insert into public.dj_track_analysis_runs (
  device_id,
  track_id,
  track_hash,
  analysis_version,
  pipeline_version,
  status,
  started_at,
  updated_at
)
values (
  ${sqlLiteral(deviceId)},
  ${sqlLiteral(trackId)},
  ${sqlLiteral(trackHash)},
  ${ANALYSIS_VERSION},
  ${sqlLiteral(PIPELINE_VERSION)},
  'running',
  now(),
  now()
)
on conflict do nothing
returning
  'RESULT_CREATED:' ||
  id::text as result;
`;

  const output =
    await runSql(
      sql,
    );

  return parseTaggedId(
    output,
    'RESULT_CREATED',
  );
}

async function findActiveAnalysisRun(
  deviceId: string,
  trackId: string,
  trackHash: string,
): Promise<number | null> {
  const sql = `
select
  'RESULT_ACTIVE:' ||
  id::text as result
from public.dj_track_analysis_runs
where device_id =
      ${sqlLiteral(deviceId)}
  and track_id =
      ${sqlLiteral(trackId)}
  and coalesce(
    track_hash,
    ''
  ) =
      ${sqlLiteral(trackHash)}
  and analysis_version =
      ${ANALYSIS_VERSION}
  and pipeline_version =
      ${sqlLiteral(PIPELINE_VERSION)}
  and status in (
    'pending',
    'running'
  )
order by
  id desc
limit 1;
`;

  const output =
    await runSql(
      sql,
    );

  return parseTaggedId(
    output,
    'RESULT_ACTIVE',
  );
}

async function acquireAnalysisRun(
  deviceId: string,
  trackId: string,
  trackHash: string,
): Promise<number> {
  /*
   * First expire stale executions in their own SQL
   * statement so the following statements receive a
   * fresh committed snapshot.
   */
  await expireStaleAnalysisRuns(
    deviceId,
    trackId,
    trackHash,
  );

  for (
    let attempt = 1;
    attempt <=
      MAX_ACQUIRE_ATTEMPTS;
    attempt += 1
  ) {
    const reusableRunId =
      await findReusableRun(
        deviceId,
        trackId,
        trackHash,
      );

    if (
      reusableRunId !==
      null
    ) {
      return reusableRunId;
    }

    /*
     * The unique partial index is the final
     * concurrency guard. If another process wins
     * the race, ON CONFLICT DO NOTHING returns no row.
     */
    const createdRunId =
      await tryCreateAnalysisRun(
        deviceId,
        trackId,
        trackHash,
      );

    if (
      createdRunId !==
      null
    ) {
      return createdRunId;
    }

    /*
     * A concurrent transaction may have won the
     * insert race. Query again after its transaction
     * has committed.
     */
    const activeRunId =
      await findActiveAnalysisRun(
        deviceId,
        trackId,
        trackHash,
      );

    if (
      activeRunId !==
      null
    ) {
      throw new Error(
        [
          `An active audio analysis run already exists for ${trackId}.`,
          `Run ID: ${activeRunId}.`,
          'Wait for it to finish before starting another analysis.',
        ].join(' '),
      );
    }

    if (
      attempt <
      MAX_ACQUIRE_ATTEMPTS
    ) {
      await sleep(
        RETRY_DELAY_MS *
          attempt,
      );
    }
  }

  throw new Error(
    [
      `Unable to acquire an analysis run for ${trackId}.`,
      `Device: ${deviceId}.`,
      `Pipeline: ${PIPELINE_VERSION}.`,
    ].join(' '),
  );
}

function numericSqlValue(
  value: number,
): string {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    throw new Error(
      'Audio analysis contains a non-finite numeric value.',
    );
  }

  return String(
    value,
  );
}

function buildFeatureRows(
  analysisRunId: number,
  analysis: AudioAnalysis,
): string[] {
  const rows:
    string[] = [];

  if (
    analysis.durationSeconds !==
    null
  ) {
    rows.push(
      `(${analysisRunId}, 'audio', 'duration_seconds', ${numericSqlValue(
        analysis.durationSeconds,
      )}, null, null, null, 'seconds', 'audio', 1.0, now())`,
    );
  }

  if (
    analysis.sampleRate !==
    null
  ) {
    rows.push(
      `(${analysisRunId}, 'audio', 'sample_rate', ${numericSqlValue(
        analysis.sampleRate,
      )}, null, null, null, 'Hz', 'audio', 1.0, now())`,
    );
  }

  if (
    analysis.channels !==
    null
  ) {
    rows.push(
      `(${analysisRunId}, 'audio', 'channels', ${numericSqlValue(
        analysis.channels,
      )}, null, null, null, 'count', 'audio', 1.0, now())`,
    );
  }

  if (
    analysis.bitrate !==
    null
  ) {
    rows.push(
      `(${analysisRunId}, 'audio', 'bitrate', ${numericSqlValue(
        analysis.bitrate,
      )}, null, null, null, 'bps', 'audio', 1.0, now())`,
    );
  }

  if (
    analysis.codec !==
    null
  ) {
    rows.push(
      `(${analysisRunId}, 'audio', 'codec', null, ${sqlLiteral(
        analysis.codec,
      )}, null, null, null, 'audio', 1.0, now())`,
    );
  }

  return rows;
}

async function persistFeatures(
  analysisRunId: number,
  analysis: AudioAnalysis,
): Promise<number> {
  const rows =
    buildFeatureRows(
      analysisRunId,
      analysis,
    );

  if (
    rows.length ===
    0
  ) {
    throw new Error(
      'Audio analysis produced no persistable features.',
    );
  }

  const sql = `
insert into public.dj_track_features (
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
)
values
  ${rows.join(
    ',\n  ',
  )}
on conflict (
  analysis_run_id,
  feature_group,
  feature_key
)
do update set
  numeric_value =
    excluded.numeric_value,
  text_value =
    excluded.text_value,
  boolean_value =
    excluded.boolean_value,
  json_value =
    excluded.json_value,
  unit =
    excluded.unit,
  source =
    excluded.source,
  confidence =
    excluded.confidence;
`;

  await runSql(
    sql,
  );

  return rows.length;
}

async function completeAnalysisRun(
  analysisRunId: number,
): Promise<void> {
  const sql = `
update public.dj_track_analysis_runs
set
  status =
    'completed',
  completed_at =
    now(),
  updated_at =
    now(),
  last_error =
    null
where id =
      ${analysisRunId}
  and status =
      'running';
`;

  await runSql(
    sql,
  );
}

async function failAnalysisRun(
  analysisRunId: number,
  error: string,
): Promise<void> {
  const sql = `
update public.dj_track_analysis_runs
set
  status =
    'failed',
  completed_at =
    now(),
  updated_at =
    now(),
  last_error =
    ${sqlLiteral(error)}
where id =
      ${analysisRunId}
  and status =
      'running';
`;

  await runSql(
    sql,
  );
}

export class SupabaseAudioAnalysisRunPersistence
  implements
    AudioAnalysisRunPersistencePort
{
  private readonly deviceId:
    string;

  public constructor(
    deviceId: string,
  ) {
    const normalizedDeviceId =
      deviceId.trim();

    if (
      !normalizedDeviceId
    ) {
      throw new Error(
        'SYNC_AGENT_ID is required.',
      );
    }

    this.deviceId =
      normalizedDeviceId;
  }

  public async persistVerifiedAnalysis(
    trackId: string,
    analysis: AudioAnalysis,
    asset: VerifiedAudioAsset,
  ):
    Promise<
      AudioAnalysisPersistenceResult
    > {
    const normalizedTrackId =
      trackId.trim();

    if (
      !normalizedTrackId
    ) {
      throw new Error(
        'Track ID is required.',
      );
    }

    const trackHash =
      await findTrackHash(
        this.deviceId,
        normalizedTrackId,
        asset,
      );

    const analysisRunId =
      await acquireAnalysisRun(
        this.deviceId,
        normalizedTrackId,
        trackHash,
      );

    try {
      const persistedFeatures =
        await persistFeatures(
          analysisRunId,
          analysis,
        );

      await completeAnalysisRun(
        analysisRunId,
      );

      return {
        analysisRunId,

        persistedFeatures,
      };
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      try {
        await failAnalysisRun(
          analysisRunId,
          message,
        );
      } catch {
        // Preserve the original persistence failure.
      }

      throw error;
    }
  }
}