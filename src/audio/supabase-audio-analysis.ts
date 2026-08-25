import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AudioAnalysis,
  AudioAnalysisPersistenceResult,
} from './audio-analysis.js';
import type { AudioAnalysisPersistencePort } from './audio-analysis-persistence.js';
import type { VerifiedAudioAsset } from './audio-verifier.js';

const execFileAsync = promisify(execFile);

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runSql(sql: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    ['supabase', 'db', 'query', '--linked', sql],
    { maxBuffer: 8 * 1024 * 1024 },
  );

  if (stderr.trim()) {
    console.error(stderr.trim());
  }

  return stdout;
}

function parseNumericResult(
  output: string,
  marker: string,
): number | null {
  const match = output.match(
    new RegExp(`${marker}:(\\d+)`),
  );

  if (!match?.[1]) {
    return null;
  }

  const value = Number(match[1]);

  return Number.isSafeInteger(value) ? value : null;
}

function parseTextResult(
  output: string,
  marker: string,
): string | null {
  const match = output.match(
    new RegExp(`${marker}:(.+)`),
  );

  const value = match?.[1]?.trim();

  return value || null;
}

async function findAudioAssetTrackHash(
  deviceId: string,
  trackId: string,
  asset: VerifiedAudioAsset,
): Promise<string> {
  const sql = `
select
  'RESULT_TRACK_HASH:' || track_hash as result
from public.dj_track_audio_assets
where device_id = ${sqlLiteral(deviceId)}
  and track_id = ${sqlLiteral(trackId)}
  and audio_checksum = ${sqlLiteral(asset.checksum)}
  and asset_status = 'verified'
limit 1;
`;

  const output = await runSql(sql);
  const trackHash = parseTextResult(
    output,
    'RESULT_TRACK_HASH',
  );

  if (!trackHash) {
    throw new Error(
      `No verified audio asset found for ${trackId} with checksum ${asset.checksum}.`,
    );
  }

  return trackHash;
}

async function findLatestAnalysisRunId(
  deviceId: string,
  trackId: string,
  trackHash: string,
): Promise<number> {
  const sql = `
select
  'RESULT_ANALYSIS_RUN_ID:' || id::text as result
from public.dj_track_analysis_runs
where device_id = ${sqlLiteral(deviceId)}
  and track_id = ${sqlLiteral(trackId)}
  and track_hash = ${sqlLiteral(trackHash)}
  and status = 'completed'
order by completed_at desc nulls last, created_at desc, id desc
limit 1;
`;

  const output = await runSql(sql);
  const analysisRunId = parseNumericResult(
    output,
    'RESULT_ANALYSIS_RUN_ID',
  );

  if (analysisRunId === null) {
    throw new Error(
      `No completed analysis run found for ${trackId} and track hash ${trackHash}.`,
    );
  }

  return analysisRunId;
}

function numericSqlValue(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(
      'Audio analysis contains a non-finite numeric value.',
    );
  }

  return String(value);
}

export class SupabaseAudioAnalysisPersistence
  implements AudioAnalysisPersistencePort
{
  public constructor(
    private readonly deviceId: string,
  ) {
    const normalizedDeviceId = deviceId.trim();

    if (!normalizedDeviceId) {
      throw new Error('SYNC_AGENT_ID is required.');
    }

    this.deviceId = normalizedDeviceId;
  }

  public async persist(
    trackId: string,
    analysis: AudioAnalysis,
    asset: VerifiedAudioAsset,
  ): Promise<AudioAnalysisPersistenceResult> {
    const normalizedTrackId = trackId.trim();

    if (!normalizedTrackId) {
      throw new Error('Track ID is required.');
    }

    const trackHash = await findAudioAssetTrackHash(
      this.deviceId,
      normalizedTrackId,
      asset,
    );

    const analysisRunId = await findLatestAnalysisRunId(
      this.deviceId,
      normalizedTrackId,
      trackHash,
    );

    const rows = this.buildFeatureRows(
      analysisRunId,
      analysis,
    );

    if (rows.length === 0) {
      throw new Error(
        'Audio analysis produced no persistable features.',
      );
    }

    const persistSql = `
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
  ${rows.join(',\n  ')}
on conflict (analysis_run_id, feature_group, feature_key)
do update set
  numeric_value = excluded.numeric_value,
  text_value = excluded.text_value,
  boolean_value = excluded.boolean_value,
  json_value = excluded.json_value,
  unit = excluded.unit,
  source = excluded.source,
  confidence = excluded.confidence;
`;

    await runSql(persistSql);

    return {
      analysisRunId,
      persistedFeatures: rows.length,
    };
  }

  private buildFeatureRows(
    analysisRunId: number,
    analysis: AudioAnalysis,
  ): string[] {
    const rows: string[] = [];

    if (analysis.durationSeconds !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'duration_seconds', ${numericSqlValue(analysis.durationSeconds)}, null, null, null, 'seconds', 'audio', 1.0, now())`,
      );
    }

    if (analysis.sampleRate !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'sample_rate', ${numericSqlValue(analysis.sampleRate)}, null, null, null, 'Hz', 'audio', 1.0, now())`,
      );
    }

    if (analysis.channels !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'channels', ${numericSqlValue(analysis.channels)}, null, null, null, 'count', 'audio', 1.0, now())`,
      );
    }

    if (analysis.bitrate !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'bitrate', ${numericSqlValue(analysis.bitrate)}, null, null, null, 'bps', 'audio', 1.0, now())`,
      );
    }

    if (analysis.codec !== null) {
      rows.push(
        `(${analysisRunId}, 'audio', 'codec', null, ${sqlLiteral(analysis.codec)}, null, null, null, 'audio', 1.0, now())`,
      );
    }

    return rows;
  }
}